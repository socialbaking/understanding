import {
    children,
    isStaticChildNode,
    isUnknownJSXNode,
    name,
    properties,
    PropertiesRecord
} from "@virtualstate/focus";
import {h, createFragment} from "../jsx";
import {isLike} from "../is";
import {SecondLevelQuestion} from "./second-level-question";
import {index} from "cheerio/lib/api/traversing";
import {UnderstandingWithAnswers, Webpage} from "../understanding";

export interface SecondLevelQuestioningOptions {
    webpage: Webpage
}

export async function *SecondLevelQuestioning(options: SecondLevelQuestioningOptions, input: unknown) {
    const { webpage } = options;
    let nodes: unknown[]
    for await (nodes of children(input)) {
        const metaNodes: unknown[] = nodes
            .filter(isUnknownJSXNode)
            .filter(node => name(node) === "meta")
        const answers = metaNodes
            .map(node => properties(node))
            .filter((values): values is JSX.AnswersElement & PropertiesRecord => !!(values.answers && values.understanding))
            .map(({ answers }) => answers);
        const others = nodes.filter(node => !metaNodes.includes(node));
        yield (
            <>
                {others}
                {answers.map((understanding, index, array) => {
                    return (
                        <SecondLevelQuestion
                            understanding={understanding}
                            webpage={webpage}
                            index={index}
                            array={array}
                        />
                    );
                })}
            </>
        )
    }
}