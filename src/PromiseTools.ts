function reflect<T>(promise: Promise<T>): Promise<SettledPromise<T>> {
    return promise.then(
        (v: T) => {
            return {status: 'fulfilled', value: v};
        },
        (error) => {
            return {status: 'rejected', reason: error};
        }
    );
}

/**
 * Drop in replacement for Promise.allSettled
 *
 * see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
 */
export async function allSettled<T>(promises: Promise<T>[]): Promise<SettledPromise<T>[]> {
    return Promise.all(promises.map(reflect));
}

export interface SettledPromise<T> {
    status: 'fulfilled' | 'rejected';
    value?: T;
    reason?: any;
}