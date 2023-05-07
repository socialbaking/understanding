import {UnderstandingWithAnswers, Understanding, Webpage} from "../understanding";


declare global {
    namespace JSX {
        interface ValueElement extends Record<string, unknown> {
            webpage?: Webpage
            understanding?: Understanding
            answers?: UnderstandingWithAnswers
            summary?: string;
            summaries?: string[];
            index?: number;
            historyLength?: number;
            header?: string;
            title?: string;
            questions?: string[];
        }

        interface AnswersElement extends ValueElement {
            understanding: Understanding
            answers: UnderstandingWithAnswers
        }

        interface IntrinsicElements {
            meta: ValueElement;
        }
    }
}