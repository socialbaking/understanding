import type {WebpageUnderstandingOptions} from "./webpage-understanding";
import {h, createFragment} from "../jsx";
import {fetchChunkUnderstanding} from "../understanding";
import {InitialAnswer} from "./initial-answer";

export interface WebsiteTextChunkOptions extends WebpageUnderstandingOptions {
    chunk: string;
    index: number;
    array: string[];
}

export async function WebsiteTextChunk(options: WebsiteTextChunkOptions) {
    const { chunk, index, array, webpage } = options;
    const understanding = await fetchChunkUnderstanding({
        array,
        index,
        chunk,
        webpage
    });
    return <InitialAnswer understanding={understanding} webpage={webpage} />
}