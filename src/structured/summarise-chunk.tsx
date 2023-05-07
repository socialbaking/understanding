import {h, createFragment} from "../jsx";
import {askForQuestions, summarise, Webpage} from "../understanding";

export interface SummariseChunkOptions {
    webpage: Webpage;
    index: number;
    array: string[];
    chunk: string;
    history: string[];
}

export async function SummariseChunk(options: SummariseChunkOptions) {
    const { webpage, index, array, chunk } = options;

    const before = array[index - 1];
    const after = array[index + 1];

    const parts = [before, chunk, after].filter(Boolean);

    const summaries = await Promise.all(
        parts.map(part => summarise(part))
    );

    const summary = await summarise(
        summaries.join("\n\n")
    )

    const questions = await askForQuestions(
        chunk
    )

    // console.log(index, summary);

    // console.log({
    //     summaries,
    //     joinedSummary
    // });

    return (
        <meta
            index={index}
            webpage={webpage}
            summary={summary}
            summaries={summaries}
            historyLength={options.history.length}
            questions={questions}
        />
    )



}