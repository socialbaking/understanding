import {Chance} from "chance"
import mkdirp from "mkdirp";
import {children, isNode, isUnknownJSXNode, UnknownJSXNode, name, properties} from "@virtualstate/focus";
import {Webpage} from "../structured";
import {IS_OPENAI, runResultingTest} from "./helpers";
import {ok} from "../is";
import {Understanding} from "../understanding";
import {h, createFragment, LOCAL_JSX_COUNTS} from "../jsx";

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
    const results = await children(
        <>
            <Webpage url={"https://www.legislation.govt.nz/act/public/1975/0116/latest/whole.html#DLM436101"} enabled crawl />
            <Webpage url={"https://www.legislation.govt.nz/act/public/2013/0053/latest/whole.html#DLM5042921"} enabled crawl />
            <Webpage url={"https://www.legislation.govt.nz/act/public/1981/0118/latest/whole.html#DLM53790"} enabled crawl />
            <Webpage url={"https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html#LMS23193"} enabled crawl />
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
    const understandings = results
        .filter(isUnknownJSXNode)
        .filter(node => name(node) === "meta")
        .map(node => {
            const options = properties(node);
            ok<JSX.ValueElement>(options);
            return options.answers ?? options.understanding;
        });

    // console.log(...understandings);
}
