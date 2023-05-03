import {Chance} from "chance"
import {
    answerQuestions,
    fetchDocument,
    fetchDocuments,
    fetchUnderstanding,
    fetchUnderstandings
} from "../understanding/patient-documents";
import {ok} from "../is";
import {writeFile, stat, readFile} from "node:fs/promises";
import mkdirp from "mkdirp";
import {basename, extname} from "node:path";

await mkdirp("results");

const chance = new Chance();

let resultIndex = 0;
function getResultKey(fileType = "json", url = import.meta.url) {
    const { pathname } = new URL(url);
    const file = basename(pathname, extname(pathname));
    resultIndex += 1;
    const indexKey = resultIndex.toString().padStart(4, "0");
    return `results/${indexKey}.tests.${file}${fileType}`;
}

export async function runResultingTest<T>(fn: (resultFile: string) => Promise<T>, url = import.meta.url): Promise<T> {
    function is(value: unknown): value is T {
        return !!value;
    }

    const resultKey = getResultKey(".json", url);

    const isFile = await stat(resultKey).then(stat => stat.isFile()).catch(() => false);

    if (isFile) {
        const contents = await readFile(resultKey, "utf-8");
        if (contents) {
            const json = JSON.parse(contents);
            if (is(json)) {
                return json;
            }
        }
    }

    const result = await fn(resultKey);

    const json = JSON.stringify(result, undefined, "  ");

    await writeFile(resultKey, json, "utf-8");

    return result;
}

async function testClient() {
    if (!process.env.OPENAI_API_KEY) return;

    const document = await fetchDocument(
        "https://www.legislation.govt.nz/act/public/1975/0116/latest/whole.html#DLM436101"
    );

    const summaries = await runResultingTest(async () => {
        return fetchUnderstanding(
            document,
            {

            }
        );
    });

    console.log(summaries.length);

    const withAnswers = await runResultingTest(async () => {
        return answerQuestions(
            document,
            ...summaries
        )
    });

    console.log(withAnswers.length);

    //
    // const understandings = await fetchUnderstandings();
    //
    // // const summaries = understandings
    // //     .filter(understanding => understanding.text)
    // //     .map(understanding => [understanding.url, understanding.text])
    //
    // console.log(JSON.stringify(understandings, undefined, "  "));
}

await testClient();
