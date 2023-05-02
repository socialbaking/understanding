import { ChatGPTAPI } from "chatgpt";
import { ok } from "../is";

const { OPENAI_API_KEY: apiKey } = process.env;

ok(apiKey, "Expected OPENAI_API_KEY")

export const gpt = new ChatGPTAPI({
    apiKey,
    completionParams: {
        model: "gpt-3.5-turbo",
        // 0 - 2, 0.2 is deterministic, 0.8 is more random
        temperature: 0.5,
        // nucleus sampling, considers the results of tokens with the top "probability mass", decimal percentage
        top_p: 0.8,
    }
});

