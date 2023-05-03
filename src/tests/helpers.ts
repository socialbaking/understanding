import mkdirp from "mkdirp";
import {basename, extname} from "node:path";
import {readFile, stat, writeFile} from "node:fs/promises";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const IS_OPENAI = !!OPENAI_API_KEY;

await mkdirp("results");


let resultIndex = 0;
export function getResultKey(fileType = "json", url = import.meta.url) {
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