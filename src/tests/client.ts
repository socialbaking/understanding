import {Chance} from "chance"
import {
    fetchDocument,
    fetchDocuments,
    fetchUnderstanding,
    fetchUnderstandings
} from "../understanding/patient-documents";
import {ok} from "../is";

const chance = new Chance();

async function testClient() {
    const understandings = await fetchUnderstandings();

    // const summaries = understandings
    //     .filter(understanding => understanding.text)
    //     .map(understanding => [understanding.url, understanding.text])

    console.log(JSON.stringify(understandings, undefined, "  "));
}

await testClient();
