import { describe, expect, test, vi } from 'vitest';
import { cancellable as cancellableFunction } from '#functions/index.js';
import { cancellable } from '#decorators/index.js';
import { PromiseCancellable } from '#index.js';

type RequestContext = { trace: string; signal?: AbortSignal };

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;
  });
  return { promise, resolve, reject };
}

describe('cancellation function and method facades', () => {
  test('package subpaths expose the named function and decorator', async () => {
    const functions = await import('@matrixai/async-cancellable/functions');
    const decorators = await import('@matrixai/async-cancellable/decorators');
    expect(functions.cancellable).toBe(cancellableFunction);
    expect(decorators.cancellable).toBe(cancellable);
  });

  test('preserves receiver, argument order, context fields, and method parity', async () => {
    const seen: AbortSignal[] = [];
    async function read(
      this: { prefix: string },
      id: string,
      ctx: RequestContext,
    ) {
      seen.push(ctx.signal!);
      return `${this.prefix}:${id}:${ctx.trace}`;
    }
    const wrapped = cancellableFunction(read, { context: 1 });
    class Service {
      readonly prefix = 'service';

      @cancellable({ context: 1 })
      async read(id: string, ctx: RequestContext) {
        return await read.call(this, id, ctx);
      }
    }
    const service = new Service();
    const parent = new AbortController();
    const outer = { trace: 'trace', signal: parent.signal };
    const first = wrapped.call(service, 'one', outer);
    const second = service.read('two', outer);
    expect(first).toBeInstanceOf(PromiseCancellable);
    expect(second).toBeInstanceOf(PromiseCancellable);
    await expect(first).resolves.toBe('service:one:trace');
    await expect(second).resolves.toBe('service:two:trace');
    expect(outer.signal).toBe(parent.signal);
    expect(seen[0]).not.toBe(parent.signal);
    expect(seen[1]).not.toBe(parent.signal);
    expect(seen[0]).not.toBe(seen[1]);
  });

  test('local cancellation does not settle before body and cleanup or cancel siblings', async () => {
    const started = deferred();
    const bodyGate = deferred();
    const cleanupStarted = deferred();
    const cleanupGate = deferred();
    let bodySignal!: AbortSignal;
    const wrapped = cancellableFunction(
      async (ctx: RequestContext) => {
        bodySignal = ctx.signal!;
        started.resolve();
        try {
          await bodyGate.promise;
          return ctx.trace;
        } finally {
          cleanupStarted.resolve();
          await cleanupGate.promise;
        }
      },
      { context: 0 },
    );
    const parent = new AbortController();
    const first = wrapped({ trace: 'first', signal: parent.signal });
    await started.promise;
    const second = cancellableFunction(
      async (ctx: RequestContext) => ctx.signal!,
      {
        context: 0,
      },
    )({ trace: 'second', signal: parent.signal });
    const siblingSignal = await second;
    let settled = false;
    void first.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    const reason = { reason: 'stop' };
    first.cancel(reason);
    expect(bodySignal.aborted).toBe(true);
    expect(bodySignal.reason).toBe(reason);
    expect(parent.signal.aborted).toBe(false);
    expect(siblingSignal.aborted).toBe(false);
    await Promise.resolve();
    expect(settled).toBe(false);
    bodyGate.resolve();
    await cleanupStarted.promise;
    expect(settled).toBe(false);
    cleanupGate.resolve();
    await expect(first).resolves.toBe('first');
  });

  test('pre-aborted upstream still enters with the exact reason', async () => {
    const reason = { reason: 'already aborted' };
    const parent = new AbortController();
    parent.abort(reason);
    let entered = false;
    const run = cancellableFunction(
      async (ctx: RequestContext) => {
        entered = true;
        expect(ctx.signal!.aborted).toBe(true);
        expect(ctx.signal!.reason).toBe(reason);
        throw ctx.signal!.reason;
      },
      { context: 'last' },
    );
    await expect(run({ trace: 'test', signal: parent.signal })).rejects.toBe(
      reason,
    );
    expect(entered).toBe(true);
  });

  test('retains body and upstream unlink failures', async () => {
    const bodyFailure = { role: 'body' };
    const cleanupFailure = { role: 'cleanup' };
    const parent = new AbortController();
    const remove = vi
      .spyOn(parent.signal, 'removeEventListener')
      .mockImplementation(() => {
        throw cleanupFailure;
      });
    const run = cancellableFunction(
      async (_ctx: RequestContext) => {
        throw bodyFailure;
      },
      { context: 0 },
    );
    try {
      const failure = await run({ trace: 'test', signal: parent.signal }).catch(
        (e) => e,
      );
      expect(failure).toBeInstanceOf(SuppressedError);
      expect(failure.error).toBe(cleanupFailure);
      expect(failure.suppressed).toBe(bodyFailure);
    } finally {
      remove.mockRestore();
    }
  });

  test('rejects invalid selection and unsupported context before work', () => {
    const body = vi.fn(async (_ctx: RequestContext) => 'result');
    const unchecked = cancellableFunction as unknown as (
      operation: typeof body,
      options: { context: number | 'last' },
    ) => (...args: unknown[]) => Promise<unknown>;
    expect(() => unchecked(body, { context: -1 })).toThrow(TypeError);
    const run = unchecked(body, { context: 0 });
    expect(() => run()).toThrow(RangeError);
    expect(() => run(new Date())).toThrow(TypeError);
    expect(body).not.toHaveBeenCalled();
  });

  test('nested facades link downward and close without cancelling the parent', async () => {
    const entered = deferred();
    const gate = deferred();
    let outerSignal!: AbortSignal;
    let innerSignal!: AbortSignal;
    const inner = cancellableFunction(
      async (context: RequestContext) => {
        innerSignal = context.signal!;
        entered.resolve();
        await gate.promise;
        return context.trace;
      },
      { context: 0 },
    );
    const outer = cancellableFunction(
      async (context: RequestContext) => {
        outerSignal = context.signal!;
        return inner(context);
      },
      { context: 0 },
    );
    const parent = new AbortController();
    const result = outer({ trace: 'nested', signal: parent.signal });
    await entered.promise;
    const reason = { stop: true };
    result.cancel(reason);
    expect(outerSignal.reason).toBe(reason);
    expect(innerSignal.reason).toBe(reason);
    expect(parent.signal.aborted).toBe(false);
    gate.resolve();
    await expect(result).resolves.toBe('nested');
  });

  test('snapshot failures do not acquire a parent link', () => {
    const parent = new AbortController();
    const add = vi.spyOn(parent.signal, 'addEventListener');
    const failure = { snapshot: true };
    const context = new Proxy(
      { trace: 'test', signal: parent.signal },
      {
        get(target, key, receiver) {
          if (key === 'trace') throw failure;
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const run = cancellableFunction(
      async (value: RequestContext) => value.trace,
      { context: 0 },
    );
    let thrown: unknown;
    try {
      void run(context).catch(() => {});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    expect(add).not.toHaveBeenCalled();
    add.mockRestore();
  });
});
