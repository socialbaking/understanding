import {AnyNode, CheerioAPI, load} from "cheerio";
import pLimit, {LimitFunction} from "p-limit";
import {kvsEnvStorage} from "@kvs/env";
import {createHash} from "node:crypto";
import opentelemetry from "@opentelemetry/api";
import {tracer} from "../trace";

export interface Webpage {
    url: string;
    html: string;
    text: string;
    links: string[];
    $: CheerioAPI;
}

const ORIGIN_LIMITS = new Map<string, LimitFunction>();
const ORIGIN_CONCURRENCY = 1;

const storage = await kvsEnvStorage({
    name: "fetch-cache",
    version: 1
});

function getLimit(url: string) {
    const { origin } = new URL(url);
    const limit = ORIGIN_LIMITS.get(origin) ?? pLimit(ORIGIN_CONCURRENCY);
    ORIGIN_LIMITS.set(origin, limit);
    return limit;
}

function getCacheKey(url: string) {
    const hash = createHash("sha256");
    hash.update(url);
    return hash.digest().toString("hex");
}

export async function fetchWebpage(url: string, options?: RequestInit): Promise<Webpage> {
    const span = opentelemetry.trace.getActiveSpan()

    let cacheKey;

    if (!options?.method || options.method.toLowerCase() === "get") {
        cacheKey = getCacheKey(url);
        const html = await storage.get(cacheKey);
        if (html && typeof html === "string") {
            span?.setAttribute("webpage.cacheHit", true);
            return parseHTML(url, html);
        }
        span?.setAttribute("webpage.cacheMiss", true);
    }

    const headers = new Headers(options?.headers);
    headers.set("Accept", "text/html");
    const limit = getLimit(url);
    const response = await limit(async () => {
        return tracer.startActiveSpan("webpage.fetch", async (span) => {
            span.setAttribute("url", url);
            span.setAttribute("method", options?.method ?? "get");
            const response = await fetch(url, {
                ...options,
                headers
            });
            span.setAttribute("status", response.status);
            span.end();
            return response;
        })
    });
    const html = await response.text();
    if (cacheKey) {
        span?.setAttribute("webpage.cacheSet", true);
        await storage.set(cacheKey, html);
    }

    return parseHTML(url, html);
}

export function parseHTML(url: string, html: string): Webpage {
    const $ = load(html);
    const links = $("a[href]").map(
        function (this: AnyNode) {
            return $(this).attr("href")
        }
    ).toArray()
    return {
        url,
        html,
        $,
        text: $.text(),
        links
    } as const;
}