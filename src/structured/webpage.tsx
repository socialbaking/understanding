import {fetchWebpage, UnderstandingOptions} from "./client";
import {h, createFragment} from "../jsx";
import {SummariseWebpage} from "./summarise-webpage";
import {children} from "@virtualstate/focus";

export interface WebpageOptions extends UnderstandingOptions {
    url: string;
    crawl?: boolean | number;
    enabled?: boolean;
    referrer?: string;
}

export async function *Webpage(options: WebpageOptions) {
    const { url, crawl, enabled, referrer } = options;

    if (enabled === false) return;

    let webpage;
    try {
        webpage = await fetchWebpage(url);
    } catch (error) {
        console.error(`Failed to fetch the webpage ${url}`);
        if (referrer) console.error(`Referrer: ${referrer}`);
        console.error(error.message ?? error, error.cause?.message ?? "");
        return;
    }

    let nodes;

    for await (nodes of children(<SummariseWebpage {...options} webpage={webpage} />)) {
        yield nodes;
    }

    if (crawl) {
        const { pathname, hostname } = new URL(url);

        function getNextCrawl() {
            // If it's true, crawl one more level, the default
            if (crawl === true) return 1;
            // If it's not a number, make it false, no more crawling
            if (typeof crawl !== "number") return false;
            // Remove this level of crawling
            return crawl - 1;
        }

        const nextCrawl = getNextCrawl();

        yield (
            <>
                {nodes}
                {
                    webpage.links
                        .map(link => new URL(link, url))
                        .filter(link => link.hostname !== hostname || link.pathname !== pathname)
                        .map(url => <Webpage {...options} url={url.toString()} referrer={options.url} crawl={nextCrawl} />)
                }
            </>
        );
    }
}