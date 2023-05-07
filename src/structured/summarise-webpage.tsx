import {h, createFragment} from "../jsx";
import {
    DEFAULT_MESSAGE_TOKEN_MAX,
    getMessageTokenCount, header,
    splitTextIntoChunks, summarise,
    UnderstandingOptions,
    Webpage
} from "../understanding";
import {SummariseChunk} from "./summarise-chunk";
import {children, name, properties} from "@virtualstate/focus";
import {CheerioAPI} from "cheerio";

export interface SummariseWebpageOptions extends UnderstandingOptions {
    webpage: Webpage;
    text?: string;
    history?: string[]
}

const JOIN_GROUPS = 3;
const SEPARATOR = "\n\n";

export async function *SummariseWebpage(options: SummariseWebpageOptions) {
    const { webpage } = options;

    const text = options.text ?? webpage.text;
    const history = (options.history ?? []).concat(text);
    const chunks = splitTextIntoChunks(text, options);

    let chunkNodes: unknown[];

    for await (chunkNodes of children(
        chunks.map(
            (chunk, index, array) => <SummariseChunk history={history} webpage={webpage} index={index} array={array} chunk={chunk} />
        )
    )) {
        yield chunkNodes;
    }

    function getMeta(nodes: unknown[]) {
        return chunkNodes
            .filter(node => name(node) === "meta")
            .map(properties)
            .filter(isValueElementProperties)
            .sort(({ index: a }, { index: b }) => a < b ? -1 : 1);
    }

    function getSummaries(nodes: unknown[]) {
        return getMetaSummaries(
            getMeta(nodes)
        );
    }

    function getMetaSummaries(meta: JSX.ValueElement[]) {
        return meta
            .map(values => values.summary)
            .filter(isString);
    }

    const summaries = getSummaries(chunkNodes);

    const groups = summaries.reduce(
        (summaries: string[][], string: string) => {
            const existing = summaries.at(-1);
            if (existing && existing.length < JOIN_GROUPS) {
                existing.push(string);
                return summaries;
            }
            const next = [string];
            summaries.push(next);
            return summaries;
        },
        []
    )

    const groupedSummaries = await Promise.all(
        groups
            .map(group => group.join(SEPARATOR))
            .map(summary => summarise(summary))
    )

    const joined = groupedSummaries.join(SEPARATOR)

    const joinedTokens = getMessageTokenCount(`${joined} Summarise this + some extra space`);

    const isJoinedOverMax = joinedTokens > DEFAULT_MESSAGE_TOKEN_MAX;

    // console.log({ url: webpage.url, joined, joinedTokens, isJoinedOverMax, joinedParts: groupedSummaries.length, originalParts: summaries.length, tokensPerPart: joinedTokens / groupedSummaries.length  });

    let secondarySummaryNodes: unknown[];

    if (isJoinedOverMax) {
        for await (secondarySummaryNodes of children(
            <SummariseWebpage webpage={webpage} text={joined} history={history} />
        )) {
            yield (
                <>
                    {chunkNodes}
                    {secondarySummaryNodes}
                </>
            )
        }
    }


    // This should be using from secondarySummaryNodesInstead
    const summaryHeader = await header(joined);
    const title = webpage.$("title").text()?.trim() || summaryHeader;
    const summary = await summarise(`${title}:\n\n${joined}`).catch(() => "");

    // console.log(history.length, title, summary);

    yield (
        <>
            <meta
                index={-1}
                webpage={webpage}
                summary={summary}
                summaries={groupedSummaries}
                historyLength={history.length}
                header={summaryHeader}
                title={title}
            />
            {chunkNodes}
            {secondarySummaryNodes}
        </>
    )

}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

export function isValueElementProperties(value: unknown): value is JSX.ValueElement {
    return !!value;
}