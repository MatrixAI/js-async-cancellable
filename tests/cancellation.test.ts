import type { ContextCancellation, ContextOperation } from '@matrixai/contexts';
import { describe, expect, test, vi } from 'vitest';
import { bracketResource } from '@matrixai/contexts';
import * as packageRoot from '#index.js';
import { CancellationController, createCancellationScope } from '#index.js';
import { waitForPromise } from '#utils.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('provider-owned directional cancellation', () => {
  test('CASE-CANCEL-EXPORTS: the scope is public and the wait helper is internal', () => {
    expect(packageRoot.createCancellationScope).toBe(createCancellationScope);
    expect(Object.keys(packageRoot).sort()).toEqual([
      'CancellationController',
      'PromiseCancellable',
      'createCancellationScope',
    ]);
    expect(packageRoot.PromiseCancellable.name).toBe('PromiseCancellable');
    expect(packageRoot).not.toHaveProperty('CancellationSource');
    expect(packageRoot).not.toHaveProperty('CancellablePromise');
    expect(packageRoot).not.toHaveProperty('waitForPromise');
  });

  test('CASE-CANCEL-FANIN: distinct links, direction and pre-aborted input order', () => {
    const one = new AbortController();
    const two = new AbortController();
    const add = vi.spyOn(one.signal, 'addEventListener');
    const removeOne = vi.spyOn(one.signal, 'removeEventListener');
    const removeTwo = vi.spyOn(two.signal, 'removeEventListener');
    const linked = new CancellationController([
      one.signal,
      one.signal,
      two.signal,
    ]);
    expect(add).toHaveBeenCalledTimes(1);
    two.abort(null);
    expect(linked.signal.reason).toBeNull();
    expect(one.signal.aborted).toBe(false);
    linked.close();
    linked.close();
    expect(removeOne).toHaveBeenCalledTimes(1);
    expect(removeTwo).toHaveBeenCalledTimes(1);
    one.abort(0);
    const preaborted = new CancellationController([one.signal, two.signal]);
    expect(preaborted.signal.reason).toBe(0);
    preaborted.close();
  });

  test('CASE-CANCEL-SHIELD: omitted forwarding leaves upstream untouched', async () => {
    const parent = new AbortController();
    parent.abort('upstream');
    const operation: ContextOperation<ContextCancellation, boolean> = async ({
      signal,
    }) => signal.aborted;
    await expect(
      createCancellationScope({ inherit: false })(operation)({
        signal: parent.signal,
      }),
    ).resolves.toBe(false);
    expect(parent.signal.reason).toBe('upstream');
  });

  test('CASE-CANCEL-OWNER: the class owns its child and link lifecycle', () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const owner = new CancellationController(parent.signal);
    expect(owner).toBeInstanceOf(CancellationController);
    expect(owner).toBeInstanceOf(AbortController);
    const reason = { child: true };
    owner.abort(reason);
    expect(owner.signal.reason).toBe(reason);
    expect(parent.signal.aborted).toBe(false);
    owner.close();
    owner.close();
    expect(remove).toHaveBeenCalledTimes(1);

    const closed = new CancellationController();
    closed.close();
    closed.abort(reason);
    expect(closed.signal.reason).toBe(reason);
  });

  test('CASE-CANCEL-DIRECTION: parent reason identity, child isolation, independent siblings, and idempotent close', () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const first = new CancellationController(parent.signal);
    const second = new CancellationController(parent.signal);
    const childReason = { child: true };
    first.abort(childReason);
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
    const closed = new CancellationController();
    closed.close();
    closed.abort('local request');
    expect(closed.signal.reason).toBe('local request');
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
    const add = vi.spyOn(parent.signal, 'addEventListener');
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
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
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
      const remove = vi.spyOn(parent.signal, 'removeEventListener');
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
    vi.spyOn(parent.signal, 'addEventListener').mockImplementation(
      (...args) => {
        add(...args);
        throw primary;
      },
    );
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    expect(() => new CancellationController(parent.signal)).toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
    const cleanup = { cleanup: true };
    remove.mockImplementation(() => {
      throw cleanup;
    });
    try {
      new CancellationController(parent.signal);
      throw new Error('expected setup failure');
    } catch (failure) {
      expect(failure).toBeInstanceOf(SuppressedError);
      expect((failure as SuppressedError).error).toBe(cleanup);
      const setupFailure = (failure as SuppressedError).suppressed;
      expect(setupFailure).toBeInstanceOf(SuppressedError);
      expect((setupFailure as SuppressedError).error).toBe(cleanup);
      expect((setupFailure as SuppressedError).suppressed).toBe(primary);
    }
  });

  test('CASE-CANCEL-UNLINK: every link is attempted and multiple failures are retained', () => {
    const first = new AbortController();
    const second = new AbortController();
    const failures = [{ first: true }, { second: true }];
    const removeFirst = vi
      .spyOn(first.signal, 'removeEventListener')
      .mockImplementation(() => {
        throw failures[0];
      });
    const removeSecond = vi
      .spyOn(second.signal, 'removeEventListener')
      .mockImplementation(() => {
        throw failures[1];
      });
    const owner = new CancellationController([first.signal, second.signal]);
    try {
      owner.close();
      throw new Error('expected unlink failure');
    } catch (failure) {
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual(failures);
    }
    expect(() => owner.close()).toThrow();
    expect(removeFirst).toHaveBeenCalledTimes(2);
    expect(removeSecond).toHaveBeenCalledTimes(2);
  });

  test('CASE-CANCEL-DYNAMIC: a long-lived owner manages independent link lifetimes', async () => {
    class Service {
      public readonly cancellation = new CancellationController();

      public async operation(): Promise<AbortSignal> {
        await Promise.resolve();
        return this.cancellation.signal;
      }
    }
    const service = new Service();
    const first = new AbortController();
    const second = new AbortController();
    const sibling = new CancellationController(second.signal);
    const unlinkFirst = service.cancellation.link(first.signal);
    expect(await service.operation()).toBe(service.cancellation.signal);
    unlinkFirst();
    first.abort('disconnected');
    expect(service.cancellation.signal.aborted).toBe(false);
    const unlinkSecond = service.cancellation.link(second.signal);
    expect(await service.operation()).toBe(service.cancellation.signal);
    const reason = { shutdown: true };
    second.abort(reason);
    expect(service.cancellation.signal.reason).toBe(reason);
    expect(sibling.signal.reason).toBe(reason);
    unlinkSecond();
    service.cancellation.close();
    sibling.close();
  });

  test('CASE-CANCEL-DUPLICATE: attachments share a listener but detach independently', () => {
    const upstream = new AbortController();
    const add = vi.spyOn(upstream.signal, 'addEventListener');
    const remove = vi.spyOn(upstream.signal, 'removeEventListener');
    const owner = new CancellationController();
    const first = owner.link(upstream.signal);
    const second = owner.link(upstream.signal);
    expect(add).toHaveBeenCalledTimes(1);
    first();
    first();
    expect(remove).not.toHaveBeenCalled();
    second();
    second();
    expect(remove).toHaveBeenCalledTimes(1);
    upstream.abort('detached');
    expect(owner.signal.aborted).toBe(false);
    owner.close();
  });

  test('CASE-CANCEL-RETRY: failed detach is inert and can be retried', () => {
    const upstream = new AbortController();
    const failure = { unlink: true };
    const spy = vi.spyOn(upstream.signal, 'removeEventListener');
    spy.mockImplementationOnce(() => {
      throw failure;
    });
    const owner = new CancellationController();
    const unlink = owner.link(upstream.signal);
    expect(unlink).toThrow();
    unlink();
    expect(spy).toHaveBeenCalledTimes(2);
    upstream.abort('not forwarded');
    expect(owner.signal.aborted).toBe(false);
    owner.close();
  });

  test('CASE-CANCEL-CLOSE-RETRY: close retries only failed physical removals', () => {
    const first = new AbortController();
    const second = new AbortController();
    const removeFirst = vi.spyOn(first.signal, 'removeEventListener');
    const removeSecond = vi.spyOn(second.signal, 'removeEventListener');
    const failure = { unlink: true };
    removeSecond.mockImplementationOnce(() => {
      throw failure;
    });
    const owner = new CancellationController([first.signal, second.signal]);
    expect(() => owner.close()).toThrow();
    expect(removeFirst).toHaveBeenCalledTimes(1);
    expect(removeSecond).toHaveBeenCalledTimes(1);
    first.abort('first');
    second.abort('second');
    expect(owner.signal.aborted).toBe(false);
    owner.close();
    owner.close();
    expect(removeFirst).toHaveBeenCalledTimes(1);
    expect(removeSecond).toHaveBeenCalledTimes(2);
  });

  test('CASE-CANCEL-PARTIAL-SETUP: a later attachment failure unlinks earlier inputs', () => {
    const first = new AbortController();
    const second = new AbortController();
    const removeFirst = vi.spyOn(first.signal, 'removeEventListener');
    const removeSecond = vi.spyOn(second.signal, 'removeEventListener');
    const addSecond = second.signal.addEventListener.bind(second.signal);
    const failure = { setup: true };
    vi.spyOn(second.signal, 'addEventListener').mockImplementation(
      (...args) => {
        addSecond(...args);
        throw failure;
      },
    );
    try {
      new CancellationController([first.signal, second.signal]);
      throw new Error('expected setup failure');
    } catch (reason) {
      expect(reason).toBe(failure);
    }
    expect(removeFirst).toHaveBeenCalledTimes(1);
    expect(removeSecond).toHaveBeenCalledTimes(1);
  });

  test('CASE-CANCEL-ATTACH-CLOSED: close forbids new links but preserves local native authority', () => {
    const owner = new CancellationController();
    owner.close();
    expect(() => owner.link(new AbortController().signal)).toThrow();
    owner.abort('local');
    expect(owner.signal.reason).toBe('local');
  });

  test('CASE-CANCEL-ATTACH-ABORTED-OWNER: an already-aborted owner creates an inert attachment', () => {
    const upstream = new AbortController();
    const add = vi.spyOn(upstream.signal, 'addEventListener');
    const owner = new CancellationController();
    const reason = { local: true };
    owner.abort(reason);
    const detach = owner.link(upstream.signal);
    detach();
    detach();
    expect(add).not.toHaveBeenCalled();
    upstream.abort('upstream');
    expect(owner.signal.reason).toBe(reason);
    owner.close();
    expect(() => owner.link(upstream.signal)).toThrow();
  });

  test('CASE-CANCEL-ATTACH-PREABORT: dynamic attachment preserves the original reason', () => {
    const upstream = new AbortController();
    const reason = { already: true };
    upstream.abort(reason);
    const owner = new CancellationController();
    const unlink = owner.link(upstream.signal);
    expect(owner.signal.reason).toBe(reason);
    unlink();
    owner.close();
  });

  test('CASE-CANCEL-ATTACH-REENTRANT: closing during setup removes the installed listener', () => {
    const upstream = new AbortController();
    const owner = new CancellationController();
    const add = upstream.signal.addEventListener.bind(upstream.signal);
    const remove = vi.spyOn(upstream.signal, 'removeEventListener');
    vi.spyOn(upstream.signal, 'addEventListener').mockImplementation(
      (...args) => {
        owner.close();
        add(...args);
      },
    );
    expect(() => owner.link(upstream.signal)).toThrow();
    expect(remove).toHaveBeenCalledTimes(2);
    upstream.abort('not forwarded');
    expect(owner.signal.aborted).toBe(false);
  });

  test('CASE-CANCEL-ATTACH-NESTED: an attachment during setup cannot claim a link that fails to install', () => {
    const upstream = new AbortController();
    const owner = new CancellationController();
    const add = upstream.signal.addEventListener.bind(upstream.signal);
    const failure = { setup: true };
    vi.spyOn(upstream.signal, 'addEventListener').mockImplementation(
      (...args) => {
        expect(() => owner.link(upstream.signal)).toThrow(
          'installation is in progress',
        );
        add(...args);
        throw failure;
      },
    );
    expect(() => owner.link(upstream.signal)).toThrow(failure);
    upstream.abort('not linked');
    expect(owner.signal.aborted).toBe(false);
    owner.close();
  });

  test('CASE-CANCEL-SETUP-RETRY: a failed installation and cleanup can be retried', () => {
    const upstream = new AbortController();
    const owner = new CancellationController();
    const add = upstream.signal.addEventListener.bind(upstream.signal);
    const setup = { setup: true };
    const cleanup = { cleanup: true };
    vi.spyOn(upstream.signal, 'addEventListener').mockImplementationOnce(
      (...args) => {
        add(...args);
        throw setup;
      },
    );
    vi.spyOn(upstream.signal, 'removeEventListener').mockImplementationOnce(
      () => {
        throw cleanup;
      },
    );
    try {
      owner.link(upstream.signal);
      throw new Error('expected setup failure');
    } catch (reason) {
      expect(reason).toBeInstanceOf(SuppressedError);
      expect((reason as SuppressedError).error).toBe(cleanup);
      expect((reason as SuppressedError).suppressed).toBe(setup);
    }
    const detach = owner.link(upstream.signal);
    const reason = { linked: true };
    upstream.abort(reason);
    expect(owner.signal.reason).toBe(reason);
    detach();
    owner.close();
  });

  test('CASE-CANCEL-UNLINK-REENTRANT: close during removal cannot claim it completed', () => {
    const upstream = new AbortController();
    const owner = new CancellationController();
    const remove = upstream.signal.removeEventListener.bind(upstream.signal);
    const spy = vi.spyOn(upstream.signal, 'removeEventListener');
    spy.mockImplementation((...args) => {
      expect(() => owner.close()).toThrow('removal is in progress');
      remove(...args);
    });
    const detach = owner.link(upstream.signal);
    detach();
    expect(spy).toHaveBeenCalledTimes(1);
    upstream.abort('detached');
    expect(owner.signal.aborted).toBe(false);
    expect(() => owner.link(new AbortController().signal)).toThrow();
  });

  test('CASE-CANCEL-UNLINK-REENTRANT-FAILURE: failed removal remains retryable after reentrant close', () => {
    const upstream = new AbortController();
    const owner = new CancellationController();
    const failure = { unlink: true };
    const spy = vi.spyOn(upstream.signal, 'removeEventListener');
    spy.mockImplementationOnce(() => {
      expect(() => owner.close()).toThrow('removal is in progress');
      throw failure;
    });
    const detach = owner.link(upstream.signal);
    expect(() => detach()).toThrow(failure);
    upstream.abort('not forwarded');
    expect(owner.signal.aborted).toBe(false);
    owner.close();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('CASE-CANCEL-NATIVE: public controller works with native signals and shared promises', async () => {
    const owner = new CancellationController();
    expect(owner).toBeInstanceOf(AbortController);
    const combined = AbortSignal.any([owner.signal]);
    const promise = new packageRoot.PromiseCancellable<number>(
      (resolve) => resolve(1),
      owner,
    );
    expect(promise.signal).toBe(owner.signal);
    await expect(promise).resolves.toBe(1);
    promise.cancel('shared');
    expect(owner.signal.reason).toBe('shared');
    expect(combined.reason).toBe('shared');
    owner.close();
  });

  test('CASE-CANCEL-CLOSED: failed physical unlink cannot forward later requests', () => {
    const parent = new AbortController();
    const cleanup = { cleanup: true };
    vi.spyOn(parent.signal, 'removeEventListener').mockImplementation(() => {
      throw cleanup;
    });
    const owner = new CancellationController(parent.signal);
    expect(() => owner.close()).toThrow();
    parent.abort('parent');
    expect(owner.signal.aborted).toBe(false);
    owner.abort('local');
    expect(owner.signal.reason).toBe('local');
  });

  test('CASE-CANCEL-FAILURE-ROLES: body failure suppresses aggregated peer unlink failures', async () => {
    const first = new AbortController();
    const second = new AbortController();
    const body = { body: true };
    const failures = [{ first: true }, { second: true }];
    vi.spyOn(first.signal, 'removeEventListener').mockImplementation(() => {
      throw failures[0];
    });
    vi.spyOn(second.signal, 'removeEventListener').mockImplementation(() => {
      throw failures[1];
    });
    const completion = bracketResource(
      () => new CancellationController([first.signal, second.signal]),
      () => {
        throw body;
      },
      (owner) => owner.close(),
    );
    try {
      await completion;
      throw new Error('expected body and cleanup failures');
    } catch (failure) {
      expect(failure).toBeInstanceOf(SuppressedError);
      const suppressed = failure as SuppressedError;
      expect(suppressed.suppressed).toBe(body);
      expect(suppressed.error).toBeInstanceOf(AggregateError);
      expect((suppressed.error as AggregateError).errors).toEqual(failures);
    }
  });
});
