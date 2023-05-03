import {gpt, sendMessage} from "./client";
import {v4} from "uuid";
import {ChatMessage} from "chatgpt";
import {ok} from "../is";
import {hasWebpage, Document, WebpageDocument, generateDocuments, FetchRepositoryDocumentsOptions} from "./document";
import {Webpage} from "./webpage";

export const BASE_UNDERSTANDING = "base-understanding";
export const BASE_ANSWERS = "base-answers";

export interface UnderstandingAnswers extends Record<string, unknown> {
    "summary": string,
    "plainSummary":string,
    "plainParts": string[],
    "isSimilarToBefore": boolean,
    "isSimilarToAfter": boolean,
    "possibleQuestions": string[],
    "isHeader": boolean,
    "header"?: string;
}

export interface Understanding extends Record<string, unknown> {
    type: string;
    url: string;
    uuid: string;
    text?: string;
    id?: string;
    possibleQuestions?: string[];
    json?: UnderstandingAnswers;
    index?: number;
    chunk: string;
    summaries?: Understanding[];
}

export interface UnderstandingOptions {
    limit?: number;
    chunkSize?: number;
}

export async function fetchUnderstanding(document: Document, options?: UnderstandingOptions): Promise<Understanding[]> {
    if (hasWebpage(document)) {
        return fetchWebpageUnderstanding(document, options);
    }
    return [];
}

interface QuestionAnswerParts {
    questions: string[];
    isAllQuestionsFoundValid: boolean;
}

export interface UnderstandingWithAnswers extends Understanding, QuestionAnswerParts {
    isAnswers: boolean;
    answers: string[];
}

export async function answerQuestions(document: Document, ...understandings: Understanding[]): Promise<UnderstandingWithAnswers[]> {

    const allQuestions = [
        ...new Set(
            understandings
                .map(getQuestions)
                .flatMap(({ questions }) => questions)
        )
    ]

    function getQuestions(understanding: Understanding): QuestionAnswerParts {
        const { possibleQuestions } = understanding;

        const questions = Array.isArray(possibleQuestions) ? possibleQuestions.filter(question => (
            typeof question === "string" &&
            // If the model understood that this should be a question, it would pose the sentence as a question and
            // end with a question mark. If not, it produced error data
            question.endsWith("?")
        )) : [];

        const isAllQuestionsFoundValid = !!possibleQuestions && questions.length === possibleQuestions.length;

        return { questions, isAllQuestionsFoundValid }
    }

    async function answerQuestion(understanding: Understanding): Promise<UnderstandingWithAnswers>  {
        const questionParts = getQuestions(understanding);

        const { questions: directQuestions } = questionParts;

        const message = `${understanding.chunk}`;

        const systemMessage = `
You are AnswerGPT

Provide the results to this message as a json object using questionKey as the keys, and answers being a JSON string or null

Provide the answer to each question following, the questions will be in the format of "questionKey, answerKey: question"

${
            directQuestions.map((question, index) => `question${index}, answer${index}: ${question}`).join("\n\n")
        }
`
        // console.log({
        //     message,
        //     systemMessage
        // })

        const result = await sendMessage(message, {
            systemMessage
        });

        const { text } = result;

        let json: Record<string, string>;
        try {
            json = JSON.parse(text)
        } catch {}

        const answers = !json ? [] : Array.from({ length: directQuestions.length }, (_, index) => {
            return json[`answer${index}`] ?? json[`question${index}, answer${index}`] ?? json[`question${index}`] ?? "";
        });

        // console.log(result);

        console.log(
            directQuestions.map((question, index) => `${question} ${answers[index] ?? ""}`).join("\n")
        );

        return {
            ...understanding,
            ...questionParts,
            type: BASE_ANSWERS,
            isAnswers: !!json,
            answers
        }
    }

    const withAnswers: UnderstandingWithAnswers[] = [];
    for (const understanding of understandings) {
        withAnswers.push(await answerQuestion(understanding));
    }
    return withAnswers;
}

export interface FetchChunkUnderstandingOptions {
    webpage: Webpage
    chunk: string;
    index: number;
    array: string[];
}

export async function fetchChunkUnderstanding(options: FetchChunkUnderstandingOptions): Promise<Understanding> {
    const {
        chunk,
        webpage,
        index,
        array
    } = options;
    const before = array[index - 1] ?? "";
    const after = array[index + 1] ?? "";
    const message = `
${chunk}
`;
    const systemMessage = `
You are ChunkParserAndSummaryGPT

Parse the content of the chunk provided, the chunk is from a webpage

Provide a json document containing the results of the questions, as an object using the questionKey, and the result being an object with a text property containing the answer, with any other properties relevant within

This chunk is index: ${index}

There are ${array.length} total chunks to parse

${before ? `The chunk before as a JSON string: ${JSON.stringify(before)}` : "This is the first chunk"}

${after ? `The chunk after as a JSON string: ${JSON.stringify(after)}` : ""}

Questions will follow this line, questions will be in the format: "questionKey, expected TypeScript type: question"

summary, string: What is the summary of this chunk

plainSummary, string: Provide just the plain language summary of this chunk, without mentioning the chunk

plainParts, string[]: Provide just the plain language parts of this chunk, without mentioning the chunk

isSimilarToBefore, boolean: If this chunk is not the first, and there is a chunk before, is the content of this chunk similar to before?

isSimilarToAfter, boolean: If this chunk is not the last, and there is a chunk after, is the content of this chunk similar to after?

possibleQuestions, string[]: What are possible questions related to this chunk that I could ask?

isHeader, boolean: Is this chunk the header of the document

header, string: What is the header of this chunk?

values, string[]: What are the numeric values with their units mentioned in this chunk?

hasEffectOnPatient, boolean: Does this chunk have an effect on a patient and what they need to consider?

patientEffects, string[]: What does a patient need to consider in relation to this chunk?
`;


    const summary: ChatMessage = await sendMessage(message, { systemMessage });

    ok<ChatMessage & Partial<Understanding>>(summary)

    summary.chunk = chunk;
    summary.index = index;

    const { text } = summary;

    let json;

    try {
        json = JSON.parse(text);
        summary.json = json;
    } catch {}

    if (json && Array.isArray(json.possibleQuestions)) {
        summary.possibleQuestions = json.possibleQuestions;
    }

    // console.log(url, chunk, summary);
    return {
        ...summary,
        type: BASE_UNDERSTANDING,
        url: webpage.url,
        chunk,
        index,
        uuid: v4()
    }
}

export async function fetchWebpageUnderstanding(document: WebpageDocument, options?: UnderstandingOptions): Promise<Understanding[]> {

    const { webpage } = document;

    const { text } = webpage;

    const array = splitTextIntoChunks(text, options);

    const summaries: Understanding[] = [];

    let index = -1;

    // Send each chunk to GPT for summarization
    for (const chunk of array) {
        index += 1;

        if (options?.limit && index >= options.limit) {
            break;
        }

        const summary = await fetchChunkUnderstanding({
            index,
            chunk,
            webpage,
            array,
        });

        summaries.push(summary);
    }

    // console.log(url, summaries);

    return summaries;
}

export function splitTextIntoChunks(text: string, options?: UnderstandingOptions): string[] {
    const chunks = [];
    let startIndex = 0;
    const chunkSize = options?.chunkSize ?? 1024;

    function getEndIndex(max: number) {
        return startIndex + max < text.length ? startIndex + max : text.length;
    }

    function getChunk(start: number = startIndex, max: number = chunkSize) {
        const endIndex = getEndIndex(max);
        return text.slice(start, endIndex);
    }

    while (startIndex < text.length) {
        let chunk = getChunk();
        startIndex += chunkSize;

        // If we aren't at the end
        if (startIndex < text.length) {
            // If we don't end at whitespace, lets find the next whitespace
            if (!/\s$/.test(chunk) && !/^\s/.test(chunk)) {
                const nextChunk = getChunk();
                // Make sure it actually contains whitespace as well
                if (/\s/.test(nextChunk)) {
                    const [nextPart] = nextChunk.split(/\s/);
                    chunk = `${chunk}${nextPart}`;
                    startIndex += nextPart.length;
                }
            }
        }

        chunks.push(chunk);

        if (options?.limit && chunks.length >= options.limit) {
            break;
        }
    }

    return chunks;
}

export async function *generateUnderstandings(options: FetchRepositoryDocumentsOptions) {
    for await (const document of generateDocuments(options)) {
        yield await fetchUnderstanding(document);
    }
}

export async function fetchUnderstandings(options: FetchRepositoryDocumentsOptions) {
    const understandings: Understanding[] = [];
    for await (const understandings of generateUnderstandings(options)) {
        understandings.push(...understandings);
    }
    return understandings;
}