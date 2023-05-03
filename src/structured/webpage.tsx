import {fetchWebpage, UnderstandingOptions} from "./client";
import {h, createFragment} from "@virtualstate/focus";
import {WebpageUnderstanding} from "./webpage-understanding";

export interface WebpageOptions extends UnderstandingOptions {
    url: string;
    crawl?: boolean;
}

export async function Webpage(options: WebpageOptions) {
    const { url, crawl } = options;
    const webpage = await fetchWebpage(url);
    const { pathname, hostname } = new URL(url);
    const crawler = crawl ? (
        webpage.links
            .map(link => new URL(link, url))
            .filter(link => link.hostname !== hostname || link.pathname !== pathname)
            .map(url => <Webpage {...options} url={url.toString()} />)
    ) : undefined;
    return (
        <>
            <WebpageUnderstanding {...options} webpage={webpage} />
            {crawler}
        </>
    );
}