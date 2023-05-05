import {ChatGPTAPI, ChatMessage, SendMessageOptions} from "chatgpt";
import { ok } from "../is";
import {encode} from "gpt-3-encoder";
import pLimit from "p-limit";
import { createHash } from "node:crypto";
import { kvsEnvStorage } from "@kvs/env";

const { OPENAI_API_KEY: apiKey, OPENAI_TOKENS_PER_MIN: tokensPerMinString, OPENAI_CACHE } = process.env;

ok(apiKey, "Expected OPENAI_API_KEY");

// An example of the error that could happen:

// Rate limit reached for default-gpt-3.5-turbo in organization .... on tokens per min.
// Limit: 90000 / min. Current: 89236 / min.
export const tokensPerMin = tokensPerMinString && /^\d+$/.test(tokensPerMinString) ? +tokensPerMinString : 90000;

export const cacheEnabled = OPENAI_CACHE !== "false";

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

const limit = pLimit(5);

const storage = await kvsEnvStorage({
    name: "gpt-cache",
    version: 1
});

let hit = 0n;
let miss = 0n;
let set = 0n;

export async function sendMessage(message: string, options?: SendMessageOptions): Promise<ChatMessage> {
    const tokensToUse = getMessageTokenCount(message, options);
    return limit(() => run(0));

    async function run(tries = 0): Promise<ChatMessage> {

        let cacheKey, cacheMessage;

        if (cacheEnabled) {
            const cacheKeyHash = createHash("sha256");
            cacheMessage = options?.systemMessage ?
                `${message}\n${options.systemMessage}` :
                message;
            cacheKeyHash.update(cacheMessage);
            cacheKey = cacheKeyHash.digest().toString("hex");

            if (await storage.has(cacheKey)) {
                const info = await storage.get(cacheKey);
                if (typeof info === "string") {
                    const message = JSON.parse(info);
                    if (message) {
                        // console.log("Cache hit", cacheKey);
                        hit += 1n;
                        return message;
                    }
                }
            }
            // console.log("Cache miss", cacheKey);
            miss += 1n;
        }


        try {
            // Try initially if we
            const result = await gpt.sendMessage(message, options)

            if (cacheEnabled && cacheKey) {
                // console.log("Cache set", cacheKey)
                set += 1n;
                console.log({ set, miss, hit, cacheMessage });
                await storage.set(cacheKey, JSON.stringify(result));
            }

            return result;
        } catch (error) {
            if (tries > 10) {
                throw error;
            }
            // console.log({ tokensToUse });
            // console.log(error);
            // if (console.dir) {
            //     console.dir(error);
            // }
            await new Promise(resolve => setTimeout(resolve, 2500 * (tries + 1)));
            return run(tries + 1);
        }
    }
}