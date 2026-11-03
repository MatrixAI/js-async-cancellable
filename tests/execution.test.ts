import type { ContextCancellation, ContextOperation } from '@matrixai/contexts';
import { jest } from '@jest/globals';
import {
  createCancellation,
  createCancellationScope,
  startCancellation,
  completeCancellation,
  startCancellationGroup,
  startCancellationSequence,
  startSharedCancellation,
} from '#index.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('owned execution composition', () => {
  test('CASE-EXEC-FANIN: any-source direction, duplicate links, input-order pre-abort, and complete unlink', () => {
    const one = new AbortController();
    const two = new AbortController();
    const add = jest.spyOn(one.signal, 'addEventListener');
    const removeOne = jest.spyOn(one.signal, 'removeEventListener');
    const removeTwo = jest.spyOn(two.signal, 'removeEventListener');
    const linked = createCancellation([one.signal, one.signal, two.signal]);
    expect(add).toHaveBeenCalledTimes(1);
    two.abort(null);
    expect(linked.signal.reason).toBeNull();
    expect(one.signal.aborted).toBe(false);
    linked.close(); linked.close();
    expect(removeOne).toHaveBeenCalledTimes(1);
    expect(removeTwo).toHaveBeenCalledTimes(1);
    one.abort(0);
    const preaborted = createCancellation([one.signal, two.signal]);
    expect(preaborted.signal.reason).toBe(0);
    preaborted.close();
  });

  test('CASE-EXEC-SHIELD: omission of upstream forwarding is explicit and does not clear upstream', async () => {
    const parent = new AbortController();
    parent.abort('upstream');
    const operation: ContextOperation<ContextCancellation, boolean> = async ({ signal }) => signal.aborted;
    await expect(createCancellationScope({ inherit: false })(operation)({ signal: parent.signal })).resolves.toBe(false);
    const owned = startCancellation(operation, { signal: parent.signal }, { inherit: false });
    await expect(completeCancellation(owned)).resolves.toBe(false);
    expect(parent.signal.reason).toBe('upstream');
    const skipped = jest.fn(async () => 1);
    await expect(completeCancellation(startCancellation(skipped, { signal: parent.signal }))).rejects.toBe('upstream');
    expect(skipped).not.toHaveBeenCalled();
  });

  test('CASE-EXEC-RACE: early winner retains non-cooperative loser and owner-facing failure', async () => {
    const entered = deferred();
    const finish = deferred<number>();
    const failure = new Error('late loser failure');
    const group = startCancellationGroup('race', [
      async () => 7,
      async ({ signal }) => {
        entered.resolve();
        await finish.promise;
        expect(signal.aborted).toBe(true);
        throw failure;
      },
    ], {}, { cancelRemaining: 'on-selection' });
    await entered.promise;
    await expect(group.result).resolves.toBe(7);
    let completed = false;
    void group.completion.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finish.resolve(1);
    const outcome = await group.completion;
    expect(outcome).toEqual({ status: 'rejected', reason: failure });
    expect((await group.outcomes)[1]).toEqual({ status: 'rejected', reason: failure });
    expect(Object.isFrozen(outcome)).toBe(true);
  });

  test('CASE-EXEC-ALL: fail-fast selection does not discharge signalled sibling completion', async () => {
    const entered = deferred();
    const fail = deferred<number>();
    const finish = deferred<number>();
    let siblingSignal!: AbortSignal;
    const group = startCancellationGroup('all', [
      async () => fail.promise,
      async ({ signal }) => { siblingSignal = signal; entered.resolve(); return finish.promise; },
    ], {}, { cancelRemaining: 'on-selection' });
    await entered.promise;
    const primary = { primary: true };
    fail.reject(primary);
    await expect(group.result).rejects.toBe(primary);
    expect(siblingSignal.aborted).toBe(true);
    let completed = false;
    void group.completion.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finish.resolve(2);
    await expect(completeCancellation(group)).rejects.toBe(primary);
  });

  test('CASE-EXEC-OUTCOMES: one failed candidate does not abort another and preserves input order', async () => {
    const finish = deferred<number>();
    const entered = deferred();
    const group = startCancellationGroup('allSettled', [
      async () => { throw undefined; },
      async ({ signal }) => { entered.resolve(); await finish.promise; expect(signal.aborted).toBe(false); return 3; },
    ], {});
    await entered.promise;
    finish.resolve(3);
    const expected = [{ status: 'rejected', reason: undefined }, { status: 'fulfilled', value: 3 }];
    await expect(group.result).resolves.toEqual(expected);
    await expect(completeCancellation(group)).resolves.toEqual(expected);
  });

  test('CASE-EXEC-SUCCESS: candidate failure leaves a viable candidate and independent duplicate failures are retained', async () => {
    const entered = deferred();
    const finish = deferred<number>();
    const group = startCancellationGroup('any', [
      async () => { throw 0; },
      async ({ signal }) => { entered.resolve(); await finish.promise; expect(signal.aborted).toBe(false); return 4; },
    ], {});
    await entered.promise;
    finish.resolve(4);
    await expect(group.result).resolves.toBe(4);
    // Earlier selection failures are expected; their exact outcomes stay visible.
    await expect(completeCancellation(group)).resolves.toBe(4);
    expect((await group.outcomes)[0]).toEqual({ status: 'rejected', reason: 0 });
    const same = { same: true };
    const failed = startCancellationGroup('any', [
      async () => { throw same; }, async () => { throw same; },
    ], {});
    const outcome = await failed.completion;
    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') throw new Error('Expected aggregate failure');
    expect(outcome.reason).toBeInstanceOf(AggregateError);
    expect((outcome.reason as AggregateError).errors).toEqual([same, same]);
  });

  test('CASE-EXEC-SEQUENCE: a request at stage handoff prevents the next stage', async () => {
    const next = jest.fn(async () => 2);
    const reason = { handoff: true };
    const execution = startCancellationSequence([
      async () => { execution.cancel(reason); return 1; }, next,
    ], {});
    await expect(completeCancellation(execution)).rejects.toBe(reason);
    expect(next).not.toHaveBeenCalled();
    await expect(completeCancellation(startCancellationSequence([
      async () => 1, async () => 2,
    ], {}))).resolves.toEqual([1, 2]);
  });

  test('CASE-EXEC-SUBSCRIBERS: local abandonment preserves another subscriber and owner completion', async () => {
    const entered = deferred();
    const finish = deferred<number>();
    let signal!: AbortSignal;
    const owner = startSharedCancellation(async (context) => {
      signal = context.signal;
      entered.resolve();
      return finish.promise;
    }, {}, { whenIdle: 'cancel' });
    const one = new AbortController();
    const two = new AbortController();
    const first = owner.subscribe(one.signal);
    const second = owner.subscribe(two.signal);
    await entered.promise;
    const firstObserved = expect(first).rejects.toBe('first leaves');
    one.abort('first leaves');
    await firstObserved;
    expect(signal.aborted).toBe(false);
    const secondObserved = expect(second).rejects.toBe('last leaves');
    two.abort('last leaves');
    await secondObserved;
    expect(signal.aborted).toBe(true);
    await expect(owner.subscribe()).rejects.toBe(signal.reason);
    let completed = false;
    void owner.completion.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finish.resolve(9);
    await expect(completeCancellation(owner)).resolves.toBe(9);
  });

  test('CASE-EXEC-PARTIAL: iteration failure precedes acquisition and empty-input policies are explicit', async () => {
    const parent = new AbortController();
    const add = jest.spyOn(parent.signal, 'addEventListener');
    const primary = new Error('iteration');
    function* operations() {
      yield async () => 1;
      throw primary;
    }
    expect(() => startCancellationGroup('all', operations(), { signal: parent.signal })).toThrow(primary);
    expect(add).not.toHaveBeenCalled();
    await expect(completeCancellation(startCancellationGroup('all', [], {}))).resolves.toEqual([]);
    await expect(completeCancellation(startCancellationGroup('allSettled', [], {}))).resolves.toEqual([]);
    await expect(completeCancellation(startCancellationGroup('any', [], {}))).rejects.toBeInstanceOf(AggregateError);
    await expect(completeCancellation(startCancellationGroup('race', [], {}))).rejects.toBeInstanceOf(RangeError);
  });
});
