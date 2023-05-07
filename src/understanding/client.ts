import {ChatGPTAPI, ChatMessage, SendMessageOptions} from "chatgpt";
import { ok } from "../is";
import {encode} from "gpt-3-encoder";
import pLimit, {LimitFunction} from "p-limit";
import { createHash } from "node:crypto";
import { kvsEnvStorage } from "@kvs/env";
import toMillisecond from "string-to-ms";
import {defer} from "@virtualstate/promise";
import {scheduler} from "timers/promises";
import {compositeKey} from "@virtualstate/composite-key";
import opentelemetry from "@opentelemetry/api";
import {tracer} from "../trace";
import {isString} from "@virtualstate/focus";
import {Runtime} from "inspector";

const { OPENAI_API_KEY: apiKey, OPENAI_TOKENS_PER_MIN: tokensPerMinString, OPENAI_CACHE } = process.env;

ok(apiKey, "Expected OPENAI_API_KEY");

// An example of the error that could happen:

// Rate limit reached for default-gpt-3.5-turbo in organization .... on tokens per min.
// Limit: 90000 / min. Current: 89236 / min.
export const tokensPerMin = tokensPerMinString && /^\d+$/.test(tokensPerMinString) ? +tokensPerMinString : 90000;

export const CACHE_ENABLED = OPENAI_CACHE !== "false";

export const gpt = new ChatGPTAPI({
    apiKey,
    completionParams: {
        model: "gpt-3.5-turbo",
        // 0 - 2, 0.2 is deterministic, 0.8 is more random
        temperature: 0.3,
        // nucleus sampling, considers the results of tokens with the top "probability mass", decimal percentage
        top_p: 0.8,
    }
});

//A helpful rule of thumb is that one token generally corresponds to ~4 characters of text for common English text.
// This translates to roughly ¾ of a word (so 100 tokens ~= 75 words).
//
// If you need a programmatic interface for tokenizing text, check out our tiktoken package for Python.
// For JavaScript, the gpt-3-encoder package for node.js works for most GPT-3 models.
export function getMessageTokenCount(message: string, options?: SendMessageOptions) {
    // I would assume both the message and "system message" count as the total tokens
    const tokens = encode(
        options?.systemMessage ?
            `${message}\n${options.systemMessage}` :
            message
    );
    return tokens.length;
}

const MESSAGE_CONCURRENCY = 100;
const MESSAGE_TIMEOUT_FACTOR_MS = 5000;
const MESSAGE_TRIES_LIMIT = 20; // triesLimit * factor = maxTimeout, maxTimeout * triesLimit = totalMaxTime

const limit = pLimit(MESSAGE_CONCURRENCY);

const uniqueKeyLimit = new Map<string, Promise<ChatMessage>>();

function limitKey(key: string, fn: () => Promise<ChatMessage>): Promise<ChatMessage> {
    const existingKeyPromise = uniqueKeyLimit.get(key);
    let nextPromise;
    if (existingKeyPromise) {
        nextPromise = existingKeyPromise.then(() => fn());
    } else {
        nextPromise = fn();
    }
    const caughtPromise = nextPromise
        .finally(() => {
            if (uniqueKeyLimit.get(key) === caughtPromise) {
                uniqueKeyLimit.delete(key)
            }
        })
        .catch((error) => void error)
    // catch any errors so next promise can move on
    uniqueKeyLimit.set(key, caughtPromise);
    return nextPromise;
}

const storage = await kvsEnvStorage({
    name: "gpt-cache",
    version: 1
});

let hit = 0n;
let miss = 0n;
let set = 0n;
let errors = 0n;
const uniqueKeysHit = new Set();

function logCacheHit() {
  console.log({ set, miss, hit, hitUnique: uniqueKeysHit.size, errors });
}

async function getFromCache(cacheKey: string): Promise<ChatMessage> {
    if (await storage.has(cacheKey)) {
        const info = await storage.get(cacheKey);
        if (typeof info === "string") {
            const message = JSON.parse(info);
            if (message) {
                return message;
            }
        }
    }
    return undefined;
}

interface ResponseError extends Error {
    cause: Response
}

function isResponseError(error: Error): error is ResponseError {
    return error.cause instanceof Response;
}

export const DEFAULT_MESSAGE_TOKEN_MAX = 5000; // Could be different tbh, like 32k tokens for a single message, lets set low
export const DEFAULT_MESSAGE_TOKEN_RATE_MAX = 90000;
const DEBUG = false;


let lastLog: string = "";

function log(...parts: unknown[]) {
    if (!DEBUG) return;
    const [firstPart] = parts;
    if (parts.length === 1 && typeof firstPart === "string") {
        if (lastLog === firstPart) {
            return;
        }
        lastLog = firstPart;
    } else {
        lastLog = "";
    }
    console.log(...parts);
}

function createSchedule() {

    interface ResponseErrorTimeout {
        requestsLimit: number;
        tokensLimit: number;
        remainingRequests: number;
        remainingTokens: number;
        resetRequests: number; // in ms from now
        resetTokens: number; // in ms from now
    }

    interface Tokens {
        tokens: number;
        at: number;
    }

    interface ScheduleRequest extends Tokens {
        timeout?: ResponseErrorTimeout;
        resolve(value?: void): void;
    }

    let scheduleRequests: ScheduleRequest[] = [],
        waiting = false;

    const DEFAULT_RESET_TIMEOUT = 60000;

    // Assume token limit until told otherwise through scheduleFromError
    let tokensLimit = DEFAULT_MESSAGE_TOKEN_RATE_MAX;
    let tokensTimeoutAt: number;
    resetTimeout();

    let usedTokens: Tokens[] = [];

    function resetTimeout() {
        tokensTimeoutAt = Date.now() + DEFAULT_RESET_TIMEOUT; // Resets after 60 seconds
    }

    /*
    x-ratelimit-limit-requests = 3500
    x-ratelimit-limit-tokens = 90000
    x-ratelimit-remaining-requests = 3492
    x-ratelimit-remaining-tokens = 161
    x-ratelimit-reset-tokens = 59.032s
    x-ratelimit-reset-requests = 41ms
     */

    /*
    ChatGPTError: OpenAI error 429: {
    "error": {
        "message": "Rate limit reached for default-gpt-3.5-turbo in organization org-bl5R7TvvprKG1K9L5uha0z0L on tokens per min. Limit: 90000 / min. Current: 87789 / min. Contact us through our help center at help.openai.com if you continue to have issues.",
        "type": "tokens",
        "param": null,
        "code": null
    }

     */

    function getRetryTimeout(error: ResponseError): ResponseErrorTimeout {
        const { cause: response } = error;
        const { headers } = response;
        const requestsLimit = required("x-ratelimit-limit-requests");
        const tokensLimit = required("x-ratelimit-limit-tokens");
        const remainingRequests = required("x-ratelimit-remaining-requests");
        const remainingTokens = required("x-ratelimit-remaining-tokens");
        const resetTokens = required("x-ratelimit-reset-tokens");
        const resetRequests = required("x-ratelimit-reset-requests");

        return {
            requestsLimit: +requestsLimit,
            tokensLimit: +tokensLimit,
            remainingRequests: +remainingRequests,
            remainingTokens: +remainingTokens,
            resetTokens: toMillisecond(resetTokens),
            resetRequests: toMillisecond(resetRequests)
        };

        function required(key: string) {
            const value = headers.get(key);
            ok(value, `Expected returned header ${key}`);
            return value;
        }
    }

    function scheduleFromError(tokens: number, error: ResponseError) {
        const timeout = getRetryTimeout(error);
        tokensLimit = timeout.tokensLimit;
        return schedule(tokens, timeout);
    }

    function scheduleTokens(tokens: number) {
        return schedule(tokens);
    }

    function cycleNextRequests(): void {

        const withinTokenLimit: ScheduleRequest[] = [];

        const oneResetAgo = Date.now() - DEFAULT_RESET_TIMEOUT;
        const withinReset = usedTokens.filter(({ at }) => at >= oneResetAgo);
        const tokenCountWithinReset = withinReset.reduce(
            (tokens, used) => tokens + used.tokens,
            0
        );

        let tokensRemaining = Math.max(0, tokensLimit - tokenCountWithinReset);

        log({ tokensRemaining, tokensLimit, tokenCountWithinReset });

        if (!tokensRemaining) return setCycleTimeout(DEFAULT_RESET_TIMEOUT);

        for (const request of scheduleRequests) {
            if (request.tokens > tokensLimit) {
                throw new Error(`Request is over token request limit, this will never be able to run, requested tokens: ${request.tokens}, token limit: ${tokensLimit}`);
            }
            const nextTokensRemaining = tokensRemaining - request.tokens;
            if (nextTokensRemaining < 0) {
                continue;
            }
            withinTokenLimit.push(request);
            tokensRemaining = nextTokensRemaining;
        }

        if (withinTokenLimit.length) {
            scheduleRequests = scheduleRequests.filter(request => !withinTokenLimit.includes(request));
            const usingTokens = withinTokenLimit.reduce(
                (tokens, request) => tokens + request.tokens,
                0
            );
            log({ tokensRemaining, usingTokens, withinTokenLimit: withinTokenLimit.length, remainingRequests: scheduleRequests.length });
            withinTokenLimit.forEach(({ resolve }) => resolve());
        } else {
            log("No requests fit within token limit");
        }

        if (!scheduleRequests.length) return;

        return setCycleTimeout(DEFAULT_RESET_TIMEOUT);
    }

    function setCycleTimeout(defaultTimeout = 0): void {
        if (waiting) {
            log("Already waiting for next timeout");
            return;
        }

        if (!scheduleRequests.length) {
            log("No scheduled requests");
            return;
        }

        const timeouts = scheduleRequests
            .filter(({ timeout }) => timeout);

        let timeout = defaultTimeout;

        if (timeouts.length) {

            const tokensAvailableAtValues = timeouts
                .map(({ at, timeout: { resetTokens } }) => {
                    return at + resetTokens;
                });
            const tokensAvailableAt = Math.max(...tokensAvailableAtValues);

            const now = Date.now();

            timeout = now - tokensAvailableAt;
            // console.log({ now, tokensAvailableAt, tokensAvailableAtValues });
        }

        if (!timeout || timeout < 0) {
            // Give a default timeout so we at least batch some tokens together and not overwhelm the api
            timeout = 2500;
        }

        waiting = true;
        log(`Waiting ${timeout / 1000} seconds until trying messages`);

        setTimeout(
            () => {
                waiting = false;
                resetTimeout();
                cycleNextRequests();
            },
            timeout
        );

    }

    async function schedule(tokens: number, timeout?: ResponseErrorTimeout) {
        // console.log("schedule");
        const { resolve, promise } = defer<void>();
        const request: ScheduleRequest = {
            tokens,
            resolve,
            at: Date.now(),
            timeout,
        }
        scheduleRequests.push(request);
        setCycleTimeout();
        await promise;
        // console.log("lets go!");
        const twoResetsAgo = Date.now() - (DEFAULT_RESET_TIMEOUT * 2);
        usedTokens = usedTokens.filter(({ at }) => at >= twoResetsAgo);
        usedTokens.push({
            tokens,
            at: Date.now()
        });
    }

    return {
        scheduleFromError,
        scheduleTokens
    } as const;

}

const schedule = createSchedule();

export async function sendMessage(message: string, options?: SendMessageOptions): Promise<ChatMessage> {

    const tokens = getMessageTokenCount(message, options);

    return tracer.startActiveSpan("gpt.sendMessage", async (span) => {
        span.setAttribute("gpt.message", message);
        if (options.systemMessage) {
            span.setAttribute("gpt.systemMessage", options.systemMessage);
        }
        const result = await maybeWithCache();
        span.setAttribute("gpt.result", result.text);
        span.end();
        return result;
    });

    async function maybeWithCache() {

        if (!CACHE_ENABLED) {
            return runWithLimit();
        }

        const cacheKeyHash = createHash("sha256");
        const cacheMessage = options?.systemMessage ?
            `${message}\n${options.systemMessage}` :
            message;
        cacheKeyHash.update(cacheMessage);
        const cacheKey = cacheKeyHash.digest().toString("hex");
        const cachedMessage = await getFromCache(cacheKey);
        if (cachedMessage) {
            const span = opentelemetry.trace.getActiveSpan();
            span?.setAttribute("gpt.cacheHit", true);
            hit += 1n;
            uniqueKeysHit.add(cacheKey);
            return cachedMessage;
        }
        return limitKey(cacheKey, () => runKey(cacheKey))
    }

    async function runKey(cacheKey: string) {
        const span = opentelemetry.trace.getActiveSpan();
        const cachedMessage = await getFromCache(cacheKey);
        if (cachedMessage) {
            span?.setAttribute("gpt.cacheHit", true);
            hit += 1n;
            uniqueKeysHit.add(cacheKey);
            return cachedMessage;
        }

        miss += 1n;
        span?.setAttribute("gpt.cacheMiss", true);

        const message = await runWithLimit();

        set += 1n;
        span?.setAttribute("gpt.cacheSet", true);
        logCacheHit();

        await storage.set(cacheKey, JSON.stringify(message));

        return message;
    }

    async function runWithLimit() {
        await schedule.scheduleTokens(tokens);
        return run(0);
    }


    async function run(tries = 0): Promise<ChatMessage> {
        const span = opentelemetry.trace.getActiveSpan();
        span?.setAttribute("gpt.tries", tries);
        try {
            return await gpt.sendMessage(message, options)
        } catch (error) {
            errors += 1n;
            if (isResponseError(error)) {
                await schedule.scheduleFromError(tokens, error);
                return run(tries);
            }
            if (tries >= MESSAGE_TRIES_LIMIT) {
                throw error;
            }
            // console.log(error, isResponseError(error));
            const timeout = MESSAGE_TIMEOUT_FACTOR_MS * (tries + 1);
            await new Promise(resolve => setTimeout(resolve, timeout));
            return run(tries + 1);
        }
    }
}

export async function summarise(text?: string) {
    if (!text) return "";
    const result = await sendMessage(text, {
        systemMessage: "Summarise this"
    });
    return result.text;
}

export async function header(text?: string) {
    if (!text) return "";
    const result = await sendMessage(text, {
        systemMessage: "Provide a header for this text"
    });
    return result.text;
}

export interface StringArrayChatMessage extends ChatMessage {
    strings: string[];
}

export async function sendMessageForArray(message: string, givenOptions: SendMessageOptions & { systemMessage: string }): Promise<StringArrayChatMessage> {
    const { systemMessage } = givenOptions;
    const options = {
        ...givenOptions,
        systemMessage: `${systemMessage}\n\nRespond only with a JSON array of strings like: ["Answer 1", "Answer 2"]`
    };
    const result = await sendMessage(message, options);
    const json = JSON.parse(result.text);
    // console.log(message, "\n", options.systemMessage, "\n", result.text);
    ok(Array.isArray(json), "Expected array to be returned");
    if (json.length) {
        const everyIsString = json.every(isString);
        ok(everyIsString, "Expected all items in array to be a string");
    }
    return {
        ...result,
        strings: json
    };
}

export async function askForQuestions(text?: string): Promise<string[]> {
    if (!text) return [];

    try {

        const { strings } = await retrySendMessageFn(sendMessageForArray, text, {
            systemMessage: "What questions could be asked about this?"
        });

        return strings;
    } catch {
        return [];
    }
}

async function retrySendMessageFn<R extends ChatMessage, A extends unknown[]>(fn: (...args: A) => Promise<R>, ...args: A): Promise<R> {
    let triesLeft = 10;
    let lastError;
    while (triesLeft) {
        triesLeft -= 1;
        try {
            return await fn(...args);
        } catch (e) {
            lastError = e;
        }
    }
    throw await Promise.reject(lastError ?? new Error(`Failed to successfully invoke ${fn.name}`));
}