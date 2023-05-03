import {fetchMarkdown, getGithubFileUrl, Markdown} from "./github";
import {fetchWebpage, Webpage} from "./webpage";

export interface Document {
    url: string;
    webpage?: Webpage;
    markdown?: Markdown;
    blob?: Blob;
}

export interface FetchRepositoryDocumentsOptions {
    owner: string;
    repository: string;
    file?: string; // README.md by default
}

export async function fetchWebpageDocument(url: string): Promise<WebpageDocument> {
    const webpage = await fetchWebpage(url);
    return { url, webpage };
}

export async function fetchDocument(options: FetchRepositoryDocumentsOptions, url: string): Promise<Document> {
    if (url.endsWith(".md")) {
        if (!url.startsWith("http")) {
            url = getGithubFileUrl(options.owner, options.repository, url);
        }
        const markdown = await fetchMarkdown(url);
        return {
            url,
            markdown,
            webpage: markdown
        };
    } else if (url.endsWith(".pdf")) {
        const response = await fetch(url);
        const blob = await response.blob();
        return {
            url,
            blob
        };
    } else {
        return await fetchWebpageDocument(url);
    }
}

export async function *generateDocuments(options: FetchRepositoryDocumentsOptions) {
    const { owner, repository, file = "README.md" } = options;
    const { links } = await fetchMarkdown(
        getGithubFileUrl(owner, repository, file)
    )
    for (const url of links) {
        yield await fetchDocument(options, url);
    }
}

export async function fetchDocuments(options: FetchRepositoryDocumentsOptions) {
    const documents: Document[] = [];
    for await (const document of generateDocuments(options)) {
        documents.push(document);
    }
    return documents;
}

export interface WebpageDocument extends Document {
    webpage: Webpage;
}

export function hasWebpage(document: Document): document is WebpageDocument {
    return !!document.webpage;
}