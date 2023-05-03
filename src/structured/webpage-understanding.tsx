import {splitTextIntoChunks, UnderstandingOptions, Webpage} from "../understanding";
import {WebsiteTextChunk} from "./webpage-text-chunk";
import {h, createFragment} from "@virtualstate/focus";

export interface WebpageUnderstandingOptions extends UnderstandingOptions {
    webpage: Webpage
}

export async function WebpageUnderstanding(options: WebpageUnderstandingOptions) {
    const { webpage } = options;

    const chunks = splitTextIntoChunks(
        webpage.text,
        options
    );

    return (
        <>
            {chunks.map((chunk, index, array) => <WebsiteTextChunk {...options} chunk={chunk} index={index} array={array} />)}
        </>
    )

}