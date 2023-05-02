import {fetchMarkdown, getGithubFileUrl, Markdown} from "./github";
import {fetchWebpage, Webpage} from "./webpage";
import {gpt} from "./client";
import {v4} from "uuid";
import {ChatMessage} from "chatgpt";
import {ok} from "../is";

export const REPOSITORY_OWNER = process.env.REPOSITORY_OWNER || "patient-nz";
export const REPOSITORY = process.env.REPOSITORY || "documents"

const README_URL = getGithubFileUrl(REPOSITORY_OWNER, REPOSITORY, "README.md");

export const readme = await fetchMarkdown(README_URL);

export interface Document {
    url: string;
    webpage?: Webpage;
    markdown?: Markdown;
    blob?: Blob;
}


export async function fetchDocument(url: string): Promise<Document> {
    if (url.endsWith(".md")) {
        if (!url.startsWith("http")) {
            url = getGithubFileUrl(REPOSITORY_OWNER, REPOSITORY, url);
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
        const webpage = await fetchWebpage(url);
        return { url, webpage };
    }
}

export async function *generateDocuments() {
    for (const url of readme.links) {
        yield await fetchDocument(url);
    }
}

export async function fetchDocuments() {
    const documents: Document[] = [];
    for await (const document of generateDocuments()) {
        documents.push(document);
    }
    return documents;
}

export interface Understanding extends Record<string, unknown> {
    url: string;
    text?: string;
    id?: string;
    possibleQuestions?: string[];
    json?: Record<string, unknown>;
}

interface WebpageDocument extends Document {
    webpage: Webpage;
}

function hasWebpage(document: Document): document is WebpageDocument {
    return !!document.webpage;
}

export async function fetchUnderstanding(document: Document) {
    if (hasWebpage(document)) {
        return fetchWebpageUnderstanding(document);
    }
    return {
        url: document.url
    };
}

export async function fetchWebpageUnderstanding(document: WebpageDocument) {

    const { webpage, url } = document;

    const { text } = webpage;

    const textChunks = splitTextIntoChunks(text, 1024);

    const summaries = [];

    let index = -1;

    let possibleQuestions: string[] = [];

    // Send each chunk to GPT for summarization
    for (const chunk of textChunks) {
        index += 1;
        const before = chunk[index - 1] ?? "";
        const after = textChunks[index + 1] ?? ""
        const message = `
${chunk}
`;
        const systemMessage = `
You are ChunkParserAndSummaryGPT

Parse the content of the chunk provided, the chunk is from a webpage

Provide a json document containing the results of the questions, as an object using the questionKey, and the result being an object with a text property containing the answer, with any other properties relevant within

This chunk is index: ${index}

There are ${textChunks.length} total chunks to parse

${before ? `The chunk before as a JSON string: ${JSON.stringify(before)}` : "This is the first chunk"}

${after ? `The chunk after as a JSON string: ${JSON.stringify(after)}` : ""}

Questions will follow this line, questions will be in the format: "questionKey: question"

summary: What is the summary of this chunk

isSimilarToBefore: If this chunk is not the first, and there is a chunk before, is the content of this chunk similar to before?

isSimilarToAfter: If this chunk is not the last, and there is a chunk after, is the content of this chunk similar to after?

possibleQuestions: What are possible questions related to this chunk that I could ask?

isHeader: Is this chunk the header of the document

header: What is the header of this chunk?
`;


        const summary: ChatMessage = await gpt.sendMessage(message, { systemMessage });

        ok<ChatMessage & Partial<Understanding>>(summary)

        const { text } = summary;

        let json;

        try {
            json = JSON.parse(text);
            summary.json = json;
        } catch {}

        if (json && Array.isArray(json.possibleQuestions)) {
            possibleQuestions = [...new Set([...possibleQuestions, ...json.possibleQuestions])];
            summary.possibleQuestions = possibleQuestions;
        }

        // console.log(url, chunk, summary);
        summaries.push(summary);
    }

    // console.log(url, summaries);

    return {
        ...summaries[0],
        url,
        summaries,
    }


}

function splitTextIntoChunks(text: string, maxTokens: number): string[] {
    const chunks = [];
    let startIndex = 0;

    while (startIndex < text.length) {
        const endIndex = startIndex + maxTokens < text.length ? startIndex + maxTokens : text.length;
        const chunk = text.slice(startIndex, endIndex);
        chunks.push(chunk);
        startIndex += maxTokens;
    }

    return chunks;
}

export async function *generateUnderstandings() {
    for await (const document of generateDocuments()) {
        yield await fetchUnderstanding(document);
    }
}

export async function fetchUnderstandings() {
    const understandings: Understanding[] = [];
    for await (const understanding of generateUnderstandings()) {
        understandings.push(understanding);
    }
    return understandings;
}