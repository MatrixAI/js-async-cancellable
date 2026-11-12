import type { PromiseCancellable } from '#index.js';
import type { PromiseCancellable as PublicPromiseCancellable } from '@matrixai/async-cancellable';
import { expectTypeOf, test } from 'vitest';
import { cancellable as exportedFunction } from '@matrixai/async-cancellable/functions';
import { cancellable as exportedDecorator } from '@matrixai/async-cancellable/decorators';
import { cancellable } from '#decorators/index.js';
import { cancellable as cancellableFunction } from '#functions/index.js';

test('function and method facade types retain their actual call contracts', () => {
  type Context = { trace: string; signal?: AbortSignal };
  const exported = exportedFunction(async (ctx: Context) => ctx.trace, {
    context: 0,
  });
  expectTypeOf(exported({ trace: 'trace' })).toEqualTypeOf<
    PublicPromiseCancellable<string>
  >();
  class ExportedService {
    @exportedDecorator({ context: 0 })
    async run(ctx: Context): Promise<string> {
      return ctx.trace;
    }
  }
  expectTypeOf(new ExportedService().run({ trace: 'trace' })).toEqualTypeOf<
    Promise<string>
  >();
  const run = cancellableFunction(
    async (label: string, ctx: Context) => {
      return `${label}:${ctx.trace}`;
    },
    { context: 1 },
  );
  expectTypeOf(run('label', { trace: 'trace' })).toEqualTypeOf<
    PromiseCancellable<string>
  >();
  // @ts-expect-error The selected context position is required.
  void run('label');
  // @ts-expect-error The selected slot is a string, not a context record.
  cancellableFunction(async (label: string, _ctx: Context) => label, {
    context: 0,
  });
  async function requiresRefinedSignal(ctx: {
    signal: AbortSignal & { special: true };
  }) {
    return ctx.signal.aborted;
  }
  // @ts-expect-error A plain signal cannot satisfy this refined capability.
  cancellableFunction(requiresRefinedSignal, { context: 0 });

  class Service {
    @cancellable({ context: 1 })
    async run(label: string, ctx: Context): Promise<string> {
      return `${label}:${ctx.trace}`;
    }
  }
  expectTypeOf(new Service().run('label', { trace: 'trace' })).toEqualTypeOf<
    Promise<string>
  >();
});
