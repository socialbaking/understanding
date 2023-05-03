import {isLike} from "../is";

export interface AcceptorFn<T> {
    (options: T): unknown;
}


export interface IsOptions<T> {
    (value: unknown): value is T;
}

export interface Typed<S> {
    type: S;
}

export function type<S, T extends Typed<S>>(fn: AcceptorFn<T>, type: S) {
    function is(value: unknown): value is T {
        return isLike<T>(value) && value.type === type;
    }
    return accepting(fn, is);
}

export function accepting<T>(fn: AcceptorFn<T>, is: IsOptions<T>) {
    return async function *Acceptor(options: Record<string | symbol, unknown>) {
        if (!is(options)) return;
        yield fn(options);
    }
}