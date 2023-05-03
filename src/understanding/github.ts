import {marked} from "marked";
import {parseHTML, Webpage} from "./webpage";
import TokensList = marked.TokensList;

export interface Markdown extends Webpage {
    markdownTokens: TokensList;
    markdown: string;
}

export function getGithubFileUrl(owner: string, repository: string, file: string, branch = "main") {
    return new URL(
        `/${owner}/${repository}/${branch}/${file}`,
        "https://raw.githubusercontent.com"
    ).toString()
}

export async function fetchMarkdown(url: string): Promise<Markdown> {
    const response = await fetch(url);
    const markdown = await response.text();
    const markdownTokens = marked.lexer(markdown)
    const html = marked.parse(markdown);
    const webpage = parseHTML(url, html);
    return {
        ...webpage,
        markdownTokens,
        markdown,
    } as const;
}
