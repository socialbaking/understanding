import {Chance} from "chance"
import mkdirp from "mkdirp";
import {children, h, createFragment, isNode, isUnknownJSXNode, UnknownJSXNode, name, properties} from "@virtualstate/focus";
import {Webpage} from "../structured";
import {IS_OPENAI, runResultingTest} from "./helpers";
import {ok} from "../is";
import {Understanding} from "../understanding";

await mkdirp("results");

const chance = new Chance();



if (IS_OPENAI) {
    const results = await children(
        <Webpage url={"https://www.legislation.govt.nz/act/public/1975/0116/latest/whole.html#DLM436101"}  />
    );
    console.log("Ran");
    console.log(
        results
        .filter(value => typeof value === "string")
        .join("\n")
    );
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
            return options.answer ?? options.understanding;
        });

    console.log(...understandings);
}
