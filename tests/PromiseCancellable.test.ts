import { describe, expect, test, vi } from 'vitest';
import { PromiseCancellable } from '#index.js';
import { waitForPromise } from '#utils.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('borrowed waiting', () => {
  test('CASE-WAIT-BORROWED: abandonment does not cancel or complete borrowed work', async () => {
    const source = deferred<number>();
    const waiting = new AbortController();
    const remove = vi.spyOn(waiting.signal, 'removeEventListener');
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
      await expect(
        waitForPromise(Promise.resolve(1), controller.signal),
      ).rejects.toBe(reason);
    },
  );

  test('CASE-WAIT-SETTLE: success, failure, and native thenable assimilation remove listeners', async () => {
    const signal = new AbortController().signal;
    const remove = vi.spyOn(signal, 'removeEventListener');
    const then = vi.fn((resolve: (value: number) => void) => resolve(3));
    await expect(
      waitForPromise({ then } as unknown as PromiseLike<number>, signal),
    ).resolves.toBe(3);
    expect(then).toHaveBeenCalledTimes(1);
    await expect(
      waitForPromise(Promise.reject(undefined), signal),
    ).rejects.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  test('CASE-WAIT-CLEANUP: failure retains primary and unlink roles', async () => {
    const signal = new AbortController().signal;
    const cleanup = { unlink: true };
    vi.spyOn(signal, 'removeEventListener').mockImplementation(() => {
      throw cleanup;
    });
    try {
      await waitForPromise(Promise.reject(undefined), signal);
      throw new Error('expected failure');
    } catch (failure) {
      expect(failure).toBeInstanceOf(SuppressedError);
      expect((failure as SuppressedError).error).toBe(cleanup);
      expect((failure as SuppressedError).suppressed).toBeUndefined();
    }
    await expect(waitForPromise(Promise.resolve(1), signal)).rejects.toBe(
      cleanup,
    );
  });

  test('CASE-WAIT-SETUP: listener setup failure is unwound and retains cleanup failure', async () => {
    const signal = new AbortController().signal;
    const add = signal.addEventListener.bind(signal);
    const setup = { setup: true };
    const cleanup = { cleanup: true };
    vi.spyOn(signal, 'addEventListener').mockImplementation((...args) => {
      add(...args);
      throw setup;
    });
    vi.spyOn(signal, 'removeEventListener').mockImplementation(() => {
      throw cleanup;
    });
    const source = deferred<number>();
    try {
      await waitForPromise(source.promise, signal);
      throw new Error('expected setup failure');
    } catch (failure) {
      expect(failure).toBeInstanceOf(SuppressedError);
      expect((failure as SuppressedError).error).toBe(cleanup);
      expect((failure as SuppressedError).suppressed).toBe(setup);
    }
    source.reject('later source failure');
    await Promise.resolve();
  });
});

describe('request-only cancellable promises', () => {
  test('CASE-PROMISE-EXECUTOR: a non-function executor throws synchronously', () => {
    expect(() => new PromiseCancellable(null as never)).toThrow(TypeError);
  });

  test('CASE-PROMISE-POLICY: listener registration cannot select cancellation policy', async () => {
    const source = deferred<number>();
    let signal!: AbortSignal;
    const promise = new PromiseCancellable<number>((resolve, reject, child) => {
      signal = child;
      child.addEventListener('abort', () => {}, { once: true });
      void source.promise.then(resolve, reject);
    });
    const reason = new DOMException('retain identity', 'AbortError');
    let settled = false;
    const observed = promise.then((value) => {
      settled = true;
      return value;
    });
    promise.cancel(reason);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(signal).toBe(promise.signal);
    expect(signal.reason).toBe(reason);
    source.resolve(5);
    await expect(observed).resolves.toBe(5);
  });

  test('CASE-PROMISE-REQUEST: request-only waiting retains source completion and shares selected authority', async () => {
    const source = deferred<number>();
    const parent = new AbortController();
    const promise = PromiseCancellable.from(source.promise, {
      policy: 'request-only',
      controller: parent,
    });
    let settled = false;
    const result = promise.then((value) => {
      settled = true;
      return value;
    });
    promise.cancel('request');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(parent.signal.reason).toBe('request');
    expect(promise.signal).toBe(parent.signal);
    source.resolve(7);
    await expect(result).resolves.toBe(7);
  });

  test('CASE-PROMISE-EARLY: abandoning a wait does not cancel borrowed work', async () => {
    const source = deferred<number>();
    const cancel = vi.fn();
    const borrowed = Object.assign(source.promise, { cancel });
    const promise = PromiseCancellable.from(borrowed, {
      policy: 'early',
    });
    const result = expect(promise).rejects.toBe('stop waiting');
    promise.cancel('stop waiting');
    await result;
    expect(cancel).not.toHaveBeenCalled();
    source.resolve(1);
    await source.promise;
  });

  test('CASE-PROMISE-NATIVE: native chain and aggregation semantics do not acquire borrowed inputs', async () => {
    await expect(
      PromiseCancellable.resolve(2).then((n) => n + 1),
    ).resolves.toBe(3);
    expect(PromiseCancellable.resolve(1).then()).toBeInstanceOf(Promise);
    await expect(
      PromiseCancellable.reject(null).catch((reason) => reason),
    ).resolves.toBeNull();
    await expect(PromiseCancellable.resolve(4).finally(() => {})).resolves.toBe(
      4,
    );
    await expect(
      PromiseCancellable.all([1, Promise.resolve(2)] as const),
    ).resolves.toEqual([1, 2]);
    await expect(
      PromiseCancellable.allSettled([Promise.reject(0)]),
    ).resolves.toEqual([{ status: 'rejected', reason: 0 }]);
    await expect(PromiseCancellable.race([3])).resolves.toBe(3);
    await expect(
      PromiseCancellable.any([Promise.reject(null), 4]),
    ).resolves.toBe(4);
    const input = deferred<number>();
    const cancel = vi.fn();
    const borrowed = Object.assign(input.promise, { cancel });
    const aggregate = PromiseCancellable.all([borrowed]);
    aggregate.cancel('only aggregate wait');
    expect(cancel).not.toHaveBeenCalled();
    input.resolve(1);
    await expect(aggregate).resolves.toEqual([1]);
  });

  test('CASE-PROMISE-THROW: synchronous executor failure and default abort reason are not rewritten', async () => {
    const reason = new DOMException('source rejection', 'AbortError');
    await expect(
      new PromiseCancellable(() => {
        throw reason;
      }),
    ).rejects.toBe(reason);
    const source = deferred<number>();
    const pending = new PromiseCancellable<number>((resolve, reject) => {
      void source.promise.then(resolve, reject);
    });
    pending.cancel();
    expect(pending.signal.reason.name).toBe('AbortError');
    source.resolve(1);
    await expect(pending).resolves.toBe(1);
  });

  test('CASE-PROMISE-ADOPTION: cancellation does not override a committed native resolution', async () => {
    const source = deferred<number>();
    const promise = new PromiseCancellable<number>((resolve) => {
      resolve(source.promise);
    });
    promise.cancel('request');
    source.resolve(9);
    await expect(promise).resolves.toBe(9);
    const settled = PromiseCancellable.resolve(42);
    settled.cancel('late request');
    await expect(settled).resolves.toBe(42);
  });

  test('CASE-PROMISE-FROM: policies and pre-aborted shared controllers are explicit', async () => {
    const source = deferred<number>();
    const controller = new AbortController();
    const reason = { request: true };
    controller.abort(reason);
    const early = PromiseCancellable.from(source.promise, {
      policy: 'early',
      controller,
    });
    const requestOnly = PromiseCancellable.from(source.promise, {
      policy: 'request-only',
      controller,
    });
    expect(early.signal).toBe(controller.signal);
    expect(requestOnly.signal).toBe(controller.signal);
    await expect(early).rejects.toBe(reason);
    source.resolve(3);
    await expect(requestOnly).resolves.toBe(3);

    const immediate = PromiseCancellable.from(Promise.resolve(4), {
      policy: 'early',
    });
    immediate.cancel(reason);
    await expect(immediate).rejects.toBe(reason);
  });

  test('CASE-PROMISE-CHAIN: independent child requests do not skip callbacks or affect siblings', async () => {
    const source = deferred<number>();
    const parent = PromiseCancellable.from(source.promise, {
      policy: 'request-only',
    });
    const callback = vi.fn((value: number, signal: AbortSignal) => {
      expect(signal.aborted).toBe(true);
      return value + 1;
    });
    const child = parent.then(callback);
    const sibling = parent.then((value) => value + 2);
    expect(child.signal).not.toBe(parent.signal);
    expect(sibling.signal).not.toBe(child.signal);
    child.cancel('child request');
    expect(parent.signal.aborted).toBe(false);
    expect(sibling.signal.aborted).toBe(false);
    source.resolve(5);
    await expect(child).resolves.toBe(6);
    await expect(sibling).resolves.toBe(7);
    expect(callback).toHaveBeenCalledOnce();
  });

  test('CASE-PROMISE-CHAIN-SHARED: explicit child controller is shared after parent settlement', async () => {
    const parent = PromiseCancellable.resolve(1);
    await parent;
    const controller = new AbortController();
    const child = parent.then(
      (_value, signal) => {
        expect(signal).toBe(controller.signal);
        expect(signal.reason).toBe('shared');
        return 2;
      },
      undefined,
      controller,
    );
    child.cancel('shared');
    await expect(child).resolves.toBe(2);
    expect(parent.signal.aborted).toBe(false);
    expect(controller.signal.reason).toBe('shared');
  });

  test('CASE-PROMISE-LATE-SHARED: a settled result can still request shared authority', async () => {
    const controller = new AbortController();
    const promise = new PromiseCancellable<number>(
      (resolve) => resolve(1),
      controller,
    );
    await expect(promise).resolves.toBe(1);
    promise.cancel('after settlement');
    expect(controller.signal.reason).toBe('after settlement');
    await expect(promise).resolves.toBe(1);
  });

  test('CASE-PROMISE-FINALLY: an asynchronous finalizer remains represented after a request', async () => {
    const cleanup = deferred<void>();
    const entered = deferred<void>();
    const reason = { body: true };
    const result = PromiseCancellable.reject(reason).finally(async (signal) => {
      expect(signal.aborted).toBe(true);
      entered.resolve();
      await cleanup.promise;
    });
    result.cancel('cleanup request');
    let settled = false;
    const observed = result.then(undefined, (failure) => {
      settled = true;
      return failure;
    });
    await entered.promise;
    expect(settled).toBe(false);
    cleanup.resolve();
    await expect(observed).resolves.toBe(reason);
  });

  test('CASE-PROMISE-INTEROP: native identity, species, assimilation and recovery', async () => {
    class Derived<T> extends PromiseCancellable<T> {}
    const parent = PromiseCancellable.resolve(4);
    expect(parent).toBeInstanceOf(Promise);
    expect(PromiseCancellable.resolve(parent)).toBe(parent);
    const derived = Derived.resolve(parent);
    expect(derived).toBeInstanceOf(Derived);
    expect(derived).not.toBe(parent);
    expect(Derived.resolve(derived)).toBe(derived);
    await expect(derived).resolves.toBe(4);
    const native = Promise.prototype.then.call(
      parent,
      (value: number) => value + 1,
    );
    expect(native).toBeInstanceOf(Promise);
    expect(native).not.toBeInstanceOf(PromiseCancellable);
    await expect(native).resolves.toBe(5);
    await expect(Promise.resolve(parent)).resolves.toBe(4);
    const finallyCallback = vi.fn();
    const recovered = PromiseCancellable.reject('failure')
      .catch((reason, signal) => {
        expect(signal.aborted).toBe(false);
        return reason;
      })
      .finally(finallyCallback);
    await expect(recovered).resolves.toBe('failure');
    expect(finallyCallback).toHaveBeenCalledOnce();
  });

  test('CASE-PROMISE-SUBCLASS: continuations use the base class while static construction uses the receiver', async () => {
    class Derived<T> extends PromiseCancellable<T> {}
    const parent = Derived.from(4, { policy: 'request-only' });
    expect(parent).toBeInstanceOf(Derived);

    const fulfilled = parent.then((value) => value + 1);
    const recovered = Derived.reject('failure').catch(() => 6);
    const finalized = parent.finally(() => {});
    for (const result of [fulfilled, recovered, finalized]) {
      expect(result.constructor).toBe(PromiseCancellable);
      expect(result).not.toBeInstanceOf(Derived);
    }
    await expect(fulfilled).resolves.toBe(5);
    await expect(recovered).resolves.toBe(6);
    await expect(finalized).resolves.toBe(4);
  });
});
