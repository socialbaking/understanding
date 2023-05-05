import {fetchWebpage, UnderstandingOptions} from "./client";
import {h} from "../jsx";
import {WebpageUnderstanding} from "./webpage-understanding";
import {SecondLevelQuestioning} from "./second-level";

export interface WebpageOptions extends UnderstandingOptions {
    url: string;
    crawl?: boolean;
    enabled?: boolean
}

export async function Webpage(options: WebpageOptions) {
    const { url, crawl, enabled } = options;
    if (enabled === false) return;
    const webpage = await fetchWebpage(url);
    const { pathname, hostname } = new URL(url);
    const crawler = crawl ? (
        webpage.links
            .map(link => new URL(link, url))
            .filter(link => link.hostname !== hostname || link.pathname !== pathname)
            .map(url => <Webpage {...options} url={url.toString()} />)
    ) : undefined;
    return (
        <SecondLevelQuestioning webpage={webpage}>
            <WebpageUnderstanding {...options} webpage={webpage} />
            {crawler}
        </SecondLevelQuestioning>
    );
}