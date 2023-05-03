import {AnyNode, CheerioAPI, load} from "cheerio";

export interface Webpage {
    url: string;
    html: string;
    text: string;
    links: string[];
    $: CheerioAPI;
}

export async function fetchWebpage(url: string, options?: RequestInit): Promise<Webpage> {
    const headers = new Headers(options?.headers);
    headers.set("Accept", "text/html");
    const response = await fetch(url, {
        ...options,
        headers
    });
    const html = await response.text();
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