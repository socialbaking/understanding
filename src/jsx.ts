/*
This file is copied from @virtualstate/focus

It will eventually be published as part of @virtualstate/focus in some way in the future

It's easier to copy over experimental stuff than deal with how to work package versions
when you're still not too sure.

It works well, but isn't plug-in enough yet.
 */

import * as focus from "@virtualstate/focus";
import { tracer } from "./trace";
import {Span} from "@opentelemetry/api";
import {isPromise, createFragment} from "@virtualstate/focus";
import {isAsyncIterable, isLike} from "./is";
import {AttributeValue} from "@opentelemetry/api";

export { createFragment }

export type OptionsRecord = Record<string | symbol, unknown>;

interface ComponentFn extends Function {
    (options: OptionsRecord, input?: unknown): unknown
}


export function isIteratorYieldResult<T>(
    value: unknown
): value is IteratorYieldResult<T> {
    return !!(
        isLike<Partial<IteratorResult<T>>>(value) &&
        typeof value.done === "boolean" &&
        !value.done
    );
}

// const openSpans = new Set();

export const LOCAL_JSX_COUNTS = new Map<unknown, number>();

function withUnderstanding(type: ComponentFn, options: OptionsRecord, ...args: unknown[]) {
    const { name } = type;

    function connect(options: OptionsRecord, input?: unknown) {
        // console.log("connect");

        let phaseIndex = 0;
        let isComplete = false;

        function asyncIterablePhase(span: Span, asyncIterable: AsyncIterable<unknown>) {

            return {
                [Symbol.asyncIterator]() {
                    return asyncIterableConnect()[Symbol.asyncIterator]();
                }
            }

            async function *asyncIterableConnect() {
                span.setAttribute("phase", "async-iterable");
                // console.log("connect async iterable");
                const iterator = asyncIterable[Symbol.asyncIterator]();
                let result;
                do {
                    result = await iterator.next();
                    if (isIteratorYieldResult(result)) {
                        yield result.value;
                    }
                } while (!result.done);
                isComplete = true;
                span.end();
                // openSpans.delete(span);
                // console.log("end async iterable");
                // console.log({ openSpans: openSpans.size });
            }

        }

        function switchPhase(span: Span, returnValue: unknown) {
            phaseIndex += 1;
            setAttribute("returnTypeTruthy", !!returnValue);
            setAttribute("phaseIndex", phaseIndex);
            if (isAsyncIterable(returnValue)) {
                setAttribute("returnType", "AsyncIterable");
                setAttribute(`returnType${phaseIndex}`, "AsyncIterable");
                return asyncIterablePhase(span, returnValue);
            } else if (isPromise(returnValue)) {
                setAttribute("returnType", "Promise");
                setAttribute(`returnType${phaseIndex}`, "Promise");
                return promisePhase(span, returnValue);
            } else {
                isComplete = true;
                setAttribute("returnType", typeof returnValue);
                span.end();
                // openSpans.delete(span);
                // console.log({ openSpans: openSpans.size });
            }
            return returnValue;

            function setAttribute(name: string, value?: AttributeValue) {
                span.setAttribute(name, value);
                span.setAttribute(`${name}${phaseIndex}`, value);
            }
        }

        async function promisePhase(span: Span, promise: Promise<unknown>): Promise<unknown> {
            span.setAttribute("phase", "promise");
            try {
                const returnValue = await promise;
                return switchPhase(span, returnValue);
            } catch (error) {
                // It is a fake throw that works better for async
                // The await handles the rejection, but coverage tools will see the throw :)
                throw await Promise.reject(error);
            } finally {

            }
        }

        function syncPhase(span: Span) {
            // openSpans.add(span);

            span.setAttribute("name", name);
            span.setAttribute("phase", "sync");
            try {
                const returnValue = type(options, input);
                return switchPhase(span, returnValue);
            } catch (e) {

                throw e;
            } finally {


            }
        }

        return tracer.startActiveSpan("h", syncPhase)
    }

    return focus.h(connect, options, ...args)
}

export function h(type: unknown, options: OptionsRecord, ...args: unknown[]) {

    LOCAL_JSX_COUNTS.set(
        type,
        (LOCAL_JSX_COUNTS.get(type) ?? 0) + 1
    );

    const node: unknown = focus.h(type, options, ...args);
    if (!isFn(type)) {
        return node;
    }
    return withUnderstanding(type, options, ...args);

    function isFn(value: unknown): value is ComponentFn {
        return typeof value === "function";
    }
}