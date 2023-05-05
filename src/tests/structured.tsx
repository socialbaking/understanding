import {Chance} from "chance"
import mkdirp from "mkdirp";
import {children, isNode, isUnknownJSXNode, UnknownJSXNode, name, properties} from "@virtualstate/focus";
import {Webpage} from "../structured";
import {IS_OPENAI, runResultingTest} from "./helpers";
import {ok} from "../is";
import {Understanding} from "../understanding";
import {h, createFragment} from "../jsx";

await mkdirp("results");

const chance = new Chance();



if (IS_OPENAI) {
    /*

     */
    const results = await children(
        <>
            <Webpage url={"https://www.legislation.govt.nz/act/public/1975/0116/latest/whole.html#DLM436101"} />
            <Webpage url={"https://www.legislation.govt.nz/act/public/2013/0053/latest/whole.html#DLM5042921"} />
            <Webpage url={"https://www.legislation.govt.nz/act/public/1981/0118/latest/whole.html#DLM53790"}  />
            <Webpage url={"https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html#LMS23193"} />
        </>
    );
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
