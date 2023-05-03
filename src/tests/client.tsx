import {Chance} from "chance"
import {
    answerQuestions,
    fetchUnderstanding,
    fetchWebpageDocument
} from "../understanding";
import {writeFile, stat, readFile} from "node:fs/promises";
import mkdirp from "mkdirp";
import {basename, extname} from "node:path";
import {children, h, createFragment} from "@virtualstate/focus";
import {Webpage} from "../structured";
import {IS_OPENAI, runResultingTest} from "./helpers";

const chance = new Chance()

// const REPOSITORY_OWNER = process.env.REPOSITORY_OWNER || "patient-nz";
// const REPOSITORY = process.env.REPOSITORY || "documents"

async function testClient() {
    if (!IS_OPENAI) return;

    const document = await fetchWebpageDocument(
        "https://www.legislation.govt.nz/act/public/1975/0116/latest/whole.html#DLM436101"
    );

    const summaries = await runResultingTest(async () => {
        return fetchUnderstanding(
            document,
            {

            }
        );
    }, import.meta.url);

    console.log(summaries.length);

    const withAnswers = await runResultingTest(async () => {
        return answerQuestions(
            document,
            ...summaries
        )
    }, import.meta.url);

    console.log(withAnswers.length);
}

await testClient();