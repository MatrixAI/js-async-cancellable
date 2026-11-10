import type { ContextCancellation, ContextTransform } from '@matrixai/contexts';
import { describe, expect, test, vi } from 'vitest';
import {
  bracketResource,
  ResourceOwningAsyncGenerator,
  scopeContextFunction,
  scopeContextMethod,
} from '@matrixai/contexts';
import { CancellationController, createCancellationScope } from '#index.js';
import { waitForPromise } from '#utils.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('cancellation provider and contexts integration', () => {
  test('CASE-CONTEXT-PROJECTION: a scope preserves unrelated fields and receives a pre-aborted signal', async () => {
    const parent = new AbortController();
    const reason = { parent: true };
    const extra = Symbol('extra');
    parent.abort(reason);
    const execute = createCancellationScope()(async ({
      signal,
      trace,
      [extra]: value,
    }: ContextCancellation & { trace: string; [extra]: number }) => {
      expect(signal).not.toBe(parent.signal);
      expect(signal.reason).toBe(reason);
      return [trace, value];
    });
    await expect(
      execute({ signal: parent.signal, trace: 'keep', [extra]: 7 }),
    ).resolves.toEqual(['keep', 7]);
  });

  test('CASE-CONTEXT-CLEANUP: abandoning a wait does not release an inner resource or unlink its signal during cleanup', async () => {
    const parent = new AbortController();
    const waiter = new AbortController();
    const cleanupEntered = deferred();
    const finishCleanup = deferred();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    let inner!: AbortSignal;
    const scope = createCancellationScope();
    const work = scope(async ({ signal }: ContextCancellation) => {
      inner = signal;
      return bracketResource(
        () => 'resource',
        async () => 'result',
        async () => {
          cleanupEntered.resolve();
          await finishCleanup.promise;
        },
      );
    })({ signal: parent.signal });
    const waiting = waitForPromise(work, waiter.signal);
    await cleanupEntered.promise;
    const abandoned = expect(waiting).rejects.toBe('wait abandoned');
    waiter.abort('wait abandoned');
    await abandoned;
    const reason = { stopped: true };
    parent.abort(reason);
    expect(inner.reason).toBe(reason);
    expect(remove).not.toHaveBeenCalled();
    finishCleanup.resolve();
    await expect(work).resolves.toBe('result');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('CASE-CONTEXT-FAILURE: provider cleanup retains both body and unlink failures', async () => {
    const parent = new AbortController();
    const primary = { body: true };
    const cleanup = { unlink: true };
    vi.spyOn(parent.signal, 'removeEventListener').mockImplementation(() => {
      throw cleanup;
    });
    const operation = createCancellationScope()(async (
      _context: ContextCancellation,
    ) => {
      throw primary;
    });
    try {
      await operation({ signal: parent.signal });
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(SuppressedError);
      expect((error as SuppressedError).error).toBe(cleanup);
      expect((error as SuppressedError).suppressed).toBe(primary);
    }
  });

  test('CASE-CONTEXT-GENERATOR: an explicitly owned generator retains cancellation links through terminal cleanup', async () => {
    const parent = new AbortController();
    const cleanupEntered = deferred();
    const finishCleanup = deferred();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const source = new ResourceOwningAsyncGenerator(
      () => new CancellationController(parent.signal),
      async function* (owned) {
        try {
          yield owned.signal;
        } finally {
          cleanupEntered.resolve();
          await finishCleanup.promise;
        }
      },
      (owned) => owned.close(),
    );
    expect(remove).not.toHaveBeenCalled();
    const first = await source.next();
    if (first.done) throw new Error('Expected a signal');
    const closing = source.return(undefined);
    await cleanupEntered.promise;
    const reason = { duringCleanup: true };
    parent.abort(reason);
    expect(first.value.reason).toBe(reason);
    expect(remove).not.toHaveBeenCalled();
    finishCleanup.resolve();
    await closing;
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('CASE-CONTEXT-FUNCTION: the shared function facade delegates to the cancellation scope', async () => {
    type Context = ContextCancellation & { trace: string };
    const scope = createCancellationScope();
    const transform: ContextTransform<Context, Context> = (operation) =>
      scope(operation);
    const original = async (prefix: string, context: Context) =>
      `${prefix}:${context.trace}:${context.signal.aborted}`;
    const wrapped = scopeContextFunction(original, transform, {
      context: 'last',
    });
    const parent = new AbortController();
    await expect(
      wrapped('ok', { signal: parent.signal, trace: 'trace' }),
    ).resolves.toBe('ok:trace:false');
  });

  test('CASE-CONTEXT-ORDER: nesting changes which signal a resource sees and release order', async () => {
    const parent = new AbortController();
    const events: string[] = [];
    const remove = parent.signal.removeEventListener.bind(parent.signal);
    vi.spyOn(parent.signal, 'removeEventListener').mockImplementation(
      (...args) => {
        events.push('unlink');
        remove(...args);
      },
    );
    const scope = createCancellationScope();
    const resource = async (
      context: ContextCancellation,
      body: () => Promise<void>,
    ) =>
      bracketResource(
        () => {
          events.push(
            context.signal === parent.signal
              ? 'acquire:parent'
              : 'acquire:child',
          );
        },
        body,
        () => {
          events.push('release');
        },
      );

    await scope(async (context: ContextCancellation) =>
      resource(context, async () => {
        events.push('body');
      }),
    )({ signal: parent.signal });
    expect(events).toEqual(['acquire:child', 'body', 'release', 'unlink']);
    events.length = 0;
    await resource({ signal: parent.signal }, () =>
      scope(async () => {
        events.push('body');
      })({ signal: parent.signal }),
    );
    expect(events).toEqual(['acquire:parent', 'body', 'unlink', 'release']);
  });

  test('CASE-CONTEXT-METHOD: method facade uses the same scope and preserves its receiver', async () => {
    type Context = ContextCancellation & { trace: string };
    const scope = createCancellationScope();
    const transform: ContextTransform<Context, Context> = (operation) =>
      scope(operation);
    class Service {
      public readonly prefix = 'service';

      @scopeContextMethod(transform, { context: 'last' })
      public async run(value: string, context: Context): Promise<string> {
        return `${this.prefix}:${value}:${context.trace}:${context.signal.aborted}`;
      }
    }
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    await expect(
      new Service().run('ok', { signal: parent.signal, trace: 'trace' }),
    ).resolves.toBe('service:ok:trace:false');
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
