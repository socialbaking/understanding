import {Chance} from "chance"
import mkdirp from "mkdirp";
import {children, h, createFragment} from "@virtualstate/focus";
import {Webpage} from "../structured";
import {IS_OPENAI, runResultingTest} from "./helpers";

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
}
