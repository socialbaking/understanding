import {UnderstandingWithAnswers, Understanding, Webpage} from "../understanding";


declare global {
    namespace JSX {
        interface ValueElement  {
            webpage?: Webpage
            understanding?: Understanding
            answer?: UnderstandingWithAnswers
        }

        interface IntrinsicElements {
            meta: ValueElement;
        }
    }
}