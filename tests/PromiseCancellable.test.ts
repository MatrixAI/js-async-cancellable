import { jest } from '@jest/globals';
import { PromiseCancellable, waitForPromise } from '#index.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('explicit cancellable waiting', () => {
  test('CASE-WAIT-BORROWED: abandonment does not cancel or complete borrowed work', async () => {
    const source = deferred<number>();
    const waiting = new AbortController();
    const remove = jest.spyOn(waiting.signal, 'removeEventListener');
    const reason = { abandoned: true };
    const result = waitForPromise(source.promise, waiting.signal);
    const observed = expect(result).rejects.toBe(reason);
    waiting.abort(reason);
    await observed;
    expect(remove).toHaveBeenCalledTimes(1);
    source.reject(new Error('late source failure remains observed'));
    await Promise.resolve();
  });

  test.each([null, 0, '', new DOMException('explicit', 'AbortError')])(
    'CASE-WAIT-REASON: preserves supplied reason %p',
    async (reason) => {
      const controller = new AbortController();
      controller.abort(reason);
      await expect(waitForPromise(Promise.resolve(1), controller.signal)).rejects.toBe(reason);
    },
  );

  test('CASE-WAIT-SETTLE: success, failure, and native thenable assimilation remove listeners', async () => {
    const signal = new AbortController().signal;
    const remove = jest.spyOn(signal, 'removeEventListener');
    const then = jest.fn((resolve: (value: number) => void) => resolve(3));
    await expect(waitForPromise({ then } as unknown as PromiseLike<number>, signal)).resolves.toBe(3);
    expect(then).toHaveBeenCalledTimes(1);
    await expect(waitForPromise(Promise.reject(undefined), signal)).rejects.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  test('CASE-FACADE-POLICY: listener registration cannot select cancellation policy', async () => {
    const source = deferred<number>();
    let signal!: AbortSignal;
    const promise = new PromiseCancellable<number>((resolve, reject, child) => {
      signal = child;
      child.addEventListener('abort', () => {}, { once: true });
      void source.promise.then(resolve, reject);
    });
    const reason = new DOMException('retain identity', 'AbortError');
    const observed = expect(promise).rejects.toBe(reason);
    promise.cancel(reason);
    await observed;
    expect(signal).toBe(promise.signal);
    expect(signal.reason).toBe(reason);
    source.resolve(5);
    await source.promise;
  });

  test('CASE-FACADE-REQUEST: request mode retains source completion and parent linkage', async () => {
    const source = deferred<number>();
    const parent = new AbortController();
    const remove = jest.spyOn(parent.signal, 'removeEventListener');
    const promise = PromiseCancellable.from(source.promise, {
      signal: parent.signal,
      cancellation: 'request',
    });
    let settled = false;
    const result = promise.then((value) => { settled = true; return value; });
    promise.cancel('request');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(parent.signal.aborted).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    source.resolve(7);
    await expect(result).resolves.toBe(7);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('CASE-FACADE-LIFETIME: early rejection does not unlink represented live source', async () => {
    const source = deferred<number>();
    const parent = new AbortController();
    const remove = jest.spyOn(parent.signal, 'removeEventListener');
    const promise = PromiseCancellable.from(source.promise, { signal: parent.signal });
    const result = expect(promise).rejects.toBe('stop waiting');
    promise.cancel('stop waiting');
    await result;
    expect(remove).not.toHaveBeenCalled();
    source.resolve(1);
    await source.promise;
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('CASE-FACADE-NATIVE: native chain and aggregation semantics do not acquire borrowed inputs', async () => {
    await expect(PromiseCancellable.resolve(2).then((n) => n + 1)).resolves.toBe(3);
    expect(PromiseCancellable.resolve(1).then()).toBeInstanceOf(Promise);
    await expect(PromiseCancellable.reject(null).catch((reason) => reason)).resolves.toBeNull();
    await expect(PromiseCancellable.resolve(4).finally(() => {})).resolves.toBe(4);
    await expect(PromiseCancellable.all([1, Promise.resolve(2)] as const)).resolves.toEqual([1, 2]);
    await expect(PromiseCancellable.allSettled([Promise.reject(0)])).resolves.toEqual([{ status: 'rejected', reason: 0 }]);
    await expect(PromiseCancellable.race([3])).resolves.toBe(3);
    await expect(PromiseCancellable.any([Promise.reject(null), 4])).resolves.toBe(4);
    const input = deferred<number>();
    const cancel = jest.fn();
    const borrowed = Object.assign(input.promise, { cancel });
    const aggregate = PromiseCancellable.all([borrowed]);
    const result = expect(aggregate).rejects.toBe('only aggregate wait');
    aggregate.cancel('only aggregate wait');
    await result;
    expect(cancel).not.toHaveBeenCalled();
    input.resolve(1);
    await input.promise;
  });

  test('CASE-FACADE-THROW: synchronous executor failure and default abort reason are not rewritten', async () => {
    const reason = new DOMException('source rejection', 'AbortError');
    await expect(new PromiseCancellable(() => { throw reason; })).rejects.toBe(reason);
    const pending = new PromiseCancellable(() => {});
    const observed = pending.catch((failure) => failure);
    pending.cancel();
    expect(await observed).toBe(pending.signal.reason);
    expect(pending.signal.reason.name).toBe('AbortError');
  });
});
