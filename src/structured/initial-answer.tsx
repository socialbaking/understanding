import {answerQuestions, Understanding, Webpage} from "../understanding";
import {h, createFragment} from "@virtualstate/focus";

export interface InitialAnswerOptions {
    understanding: Understanding;
    webpage: Webpage
}

export async function InitialAnswer(options: InitialAnswerOptions) {
    const {webpage, understanding} = options;
    const answers = await answerQuestions(
        {
            url: webpage.url,
            webpage
        },
        understanding
    );

    function isStringArray(array: unknown[]): array is string[] {
        return array.every(value => typeof value === "string");
    }

    const stringQuestions = answers
        .flatMap(answer => {
            if (!isStringArray(answer.answers)) {
                return [];
            }
            return answer.questions.map((question, index) => {
                return `${question} ${answer.answers[index] ?? ""}`;
            })
        });

    return (
        <>
            {stringQuestions}
            {answers.map(answer => (
                <meta
                    webpage={webpage}
                    understanding={understanding}
                    answer={answer}
                />
            ))}
        </>
    )
}