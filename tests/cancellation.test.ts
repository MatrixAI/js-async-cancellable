import type { ContextCancellation, ContextOperation } from '@matrixai/contexts';
import { jest } from '@jest/globals';
import {
  createCancellation,
  createCancellationScope,
  waitForPromise,
} from '#index.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('provider-owned directional cancellation', () => {
  test('CASE-CANCEL-DIRECTION: parent reason identity, child isolation, independent siblings, and idempotent close', () => {
    const parent = new AbortController();
    const remove = jest.spyOn(parent.signal, 'removeEventListener');
    const first = createCancellation(parent.signal);
    const second = createCancellation(parent.signal);
    const childReason = { child: true };
    first.cancel(childReason);
    expect(first.signal.reason).toBe(childReason);
    expect(parent.signal.aborted).toBe(false);
    expect(second.signal.aborted).toBe(false);
    const parentReason = new DOMException('parent', 'AbortError');
    parent.abort(parentReason);
    expect(second.signal.reason).toBe(parentReason);
    expect(first.signal.reason).toBe(childReason);
    first.close();
    first.close();
    second.close();
    second.close();
    expect(remove).toHaveBeenCalledTimes(2);
    const closed = createCancellation();
    closed.close();
    closed.cancel('expired authority');
    expect(closed.signal.aborted).toBe(false);
    expect(Object.isFrozen(closed)).toBe(true);
  });

  test('CASE-CANCEL-PREABORT: a pre-aborted parent is propagated before body entry', async () => {
    const parent = new AbortController();
    parent.abort(null);
    const operation: ContextOperation<ContextCancellation, unknown> = async ({
      signal,
    }) => {
      expect(signal).not.toBe(parent.signal);
      expect(signal.aborted).toBe(true);
      return signal.reason;
    };
    await expect(
      createCancellationScope()(operation)({ signal: parent.signal }),
    ).resolves.toBeNull();
  });

  test('CASE-CANCEL-REUSE: scope construction is inert and concurrent calls own distinct children', async () => {
    const provide = createCancellationScope();
    const parent = new AbortController();
    const add = jest.spyOn(parent.signal, 'addEventListener');
    const gate = deferred<void>();
    const signals: AbortSignal[] = [];
    const operation: ContextOperation<
      ContextCancellation & { trace: string },
      string
    > = async (context) => {
      signals.push(context.signal);
      await gate.promise;
      return context.trace;
    };
    const scoped = provide(operation);
    expect(add).not.toHaveBeenCalled();
    const one = scoped({ signal: parent.signal, trace: 'one' });
    const two = scoped({ signal: parent.signal, trace: 'two' });
    await Promise.resolve();
    await Promise.resolve();
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    gate.resolve();
    await expect(Promise.all([one, two])).resolves.toEqual(['one', 'two']);
  });

  test('CASE-CANCEL-COMPLETION: abandoned wait retains linkage through body and awaited cleanup', async () => {
    const parent = new AbortController();
    const caller = new AbortController();
    const remove = jest.spyOn(parent.signal, 'removeEventListener');
    const entered = deferred<void>();
    const finish = deferred<void>();
    const cleanup = deferred<void>();
    let signal!: AbortSignal;
    const completion = createCancellationScope()(async (context) => {
      signal = context.signal;
      entered.resolve();
      try {
        await finish.promise;
      } finally {
        await cleanup.promise;
      }
    })({ signal: parent.signal });
    await entered.promise;
    const waiting = waitForPromise(completion, caller.signal);
    const observed = expect(waiting).rejects.toBe('abandoned');
    caller.abort('abandoned');
    await observed;
    expect(remove).not.toHaveBeenCalled();
    const reason = { stopping: true };
    parent.abort(reason);
    expect(signal.reason).toBe(reason);
    finish.resolve();
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    cleanup.resolve();
    await completion;
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, null, 0, new Error('body')])(
    'CASE-CANCEL-FAILURE: arbitrary body rejection preserves identity and unlinks %p',
    async (reason) => {
      const parent = new AbortController();
      const remove = jest.spyOn(parent.signal, 'removeEventListener');
      await expect(
        createCancellationScope()(async () => {
          throw reason;
        })({ signal: parent.signal }),
      ).rejects.toBe(reason);
      expect(remove).toHaveBeenCalledTimes(1);
    },
  );

  test('CASE-CANCEL-SETUP: partial listener setup is unwound and double failure preserves both values', () => {
    const parent = new AbortController();
    const add = parent.signal.addEventListener.bind(parent.signal);
    const primary = { setup: true };
    jest
      .spyOn(parent.signal, 'addEventListener')
      .mockImplementation((...args) => {
        add(...args);
        throw primary;
      });
    const remove = jest.spyOn(parent.signal, 'removeEventListener');
    expect(() => createCancellation(parent.signal)).toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
    const cleanup = { cleanup: true };
    remove.mockImplementation(() => {
      throw cleanup;
    });
    try {
      createCancellation(parent.signal);
      throw new Error('expected setup failure');
    } catch (failure) {
      expect(failure).toBeInstanceOf(SuppressedError);
      expect((failure as SuppressedError).error).toBe(cleanup);
      expect((failure as SuppressedError).suppressed).toBe(primary);
    }
  });
});
