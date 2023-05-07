import {AnyNode, CheerioAPI, load} from "cheerio";
import pLimit, {LimitFunction} from "p-limit";
import {kvsEnvStorage} from "@kvs/env";
import {createHash} from "node:crypto";

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

    let cacheKey;

    if (!options?.method || options.method.toLowerCase() === "get") {
        cacheKey = getCacheKey(url);
        const html = await storage.get(cacheKey);
        if (html && typeof html === "string") {
            return parseHTML(url, html);
        }
    }

    const headers = new Headers(options?.headers);
    headers.set("Accept", "text/html");
    const limit = getLimit(url);
    const response = await limit(async () => fetch(url, {
        ...options,
        headers
    }));
    const html = await response.text();
    if (cacheKey) {
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