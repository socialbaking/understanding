import {h, createFragment} from "../jsx";
import {sendMessage, UnderstandingWithAnswers, Webpage} from "../understanding";

export interface SecondLevelQuestionOptions {
    webpage: Webpage;
    understanding: UnderstandingWithAnswers;
    index: number;
    array: UnderstandingWithAnswers[]
}

export async function SecondLevelQuestion(options: SecondLevelQuestionOptions) {
    const { webpage, understanding, index, array } = options;
    const { chunk, questions, answers } = understanding;

    const before = array[index - 1]?.chunk;
    const after = array[index + 1]?.chunk;

    // console.log("\n\n========== SecondLevelQuestion ==========\n\n")
    // console.log({ index });
    // console.log(!!before?.chunk.trim());
    // console.log("\n-----------------------------------------\n")
    // console.log(chunk.trim());
    // console.log("\n-----------------------------------------\n")
    // console.log(!!after?.chunk.trim());
    // console.log("\n=========================================\n\n")
    // console.log(questions.map((question, index) => `${question} ${answers[index] ?? ""}`).join("\n"));

    const parts = [before, chunk, after].filter(Boolean);

    async function summarise(text?: string) {
        if (!text) return "";
        const result = await sendMessage(text, {
            systemMessage: "Summarise this"
        });
        return result.text;
    }

    const summaries = await Promise.all(
        parts.map(part => summarise(part))
    );

    const summary = await summarise(
        summaries.join("\n\n")
    )

    // console.log(index, summary);

    // console.log({
    //     summaries,
    //     joinedSummary
    // });

    return (
        <meta
            webpage={webpage}
            understanding={understanding}
            summary={summary}
            summaries={summaries}
        />
    )



}