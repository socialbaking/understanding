import {Chance} from "chance"
import mkdirp from "mkdirp";
import {children, isNode, isUnknownJSXNode, UnknownJSXNode, name, properties} from "@virtualstate/focus";
import {Webpage} from "../structured";
import {IS_OPENAI, runResultingTest} from "./helpers";
import {ok} from "../is";
import {Understanding} from "../understanding";
import {h, createFragment, LOCAL_JSX_COUNTS} from "../jsx";
import {isValueElementProperties} from "../structured/summarise-webpage";

await mkdirp("results");

const chance = new Chance();



if (IS_OPENAI) {
    /*

    Expected:

    1975/0116: 346 chunks, 817 meta
    2013/0053: 144 chunks, 410 meta
    1981/0118: 314 chunks, 750 meta
    2020/0031: 18 chunks, 38 meta
     */
    const CRAWL = 0;
    const CRAWL_SAME_ORIGIN = true;
    const results = await children(
        <>
            <Webpage
                url={"https://www.legislation.govt.nz/act/public/1975/0116/latest/whole.html#DLM436101"}
                enabled
                crawl={CRAWL}
                crawlSameOrigin={CRAWL_SAME_ORIGIN}
            />
            <Webpage
                url={"https://www.legislation.govt.nz/act/public/2013/0053/latest/whole.html#DLM5042921"}
                enabled
                crawl={CRAWL}
                crawlSameOrigin={CRAWL_SAME_ORIGIN}
            />
            <Webpage
                url={"https://www.legislation.govt.nz/act/public/1981/0118/latest/whole.html#DLM53790"}
                enabled
                crawl={CRAWL}
                crawlSameOrigin={CRAWL_SAME_ORIGIN}
            />
            <Webpage
                url={"https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html#LMS23193"}
                enabled
                crawl={CRAWL}
                crawlSameOrigin={CRAWL_SAME_ORIGIN}
            />
        </>
    );
    console.log(LOCAL_JSX_COUNTS);
    console.log("Ran");
    // console.log(
    //     results
    //     .filter(value => typeof value === "string")
    //     .join("\n")
    // );
    console.log("Node names:", ...new Set(
        results
            .filter(isUnknownJSXNode)
            .map(name)
    ))
    const meta = results
        .filter(isUnknownJSXNode)
        .filter(node => name(node) === "meta")
        .map(properties)
        .filter(isValueElementProperties);


    const urls = meta.reduce<Map<string, JSX.ValueElement[]>>(
        (map, meta: JSX.ValueElement) => {
            const url = meta.webpage?.url
            if (!url) return map;
            const values = map.get(url) ?? [];
            values.push(meta)
            map.set(url, values);
            return map;
        },
        new Map<string, JSX.ValueElement[]>()
    );


    console.log({
        meta: meta.length,
        urls: urls.size
    });

    const summaries =  [...urls.keys()]
        .map(url => {
            const meta = urls.get(url);
            const negativeOnes = meta
                .filter(meta => meta.index === -1);
            console.log({ negativeOnes: negativeOnes.length });
            const questions = [...new Set(
                meta
                    .flatMap(({ questions }) => questions || [])
            )].join("\n");
            const {
                title,
                summary
            } = meta
                .filter(meta => meta.index === -1)
                .sort(({ historyLength: a }, { historyLength: b }) => a > b ? -1 : 1)
                .at(0);
            return [url, title, summary, "Questions:", questions].join("\n\n");
        })

    console.log(summaries.join("\n\n\n"))

    // console.log(...understandings);
}
