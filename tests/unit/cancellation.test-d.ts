import type {
  ContextCancellation,
  ContextOperation,
  ContextScope,
} from '@matrixai/contexts';
import { expectTypeOf, test } from 'vitest';
import {
  CancellationController,
  createCancellationScope,
  PromiseCancellable,
} from '#index.js';

test('CASE-CANCEL-TYPES: scopes retain outstanding requirements', () => {
  const scope: ContextScope<
    Partial<ContextCancellation>,
    ContextCancellation
  > = createCancellationScope();
  const operation: ContextOperation<
    ContextCancellation & { trace: string },
    number
  > = async ({ trace }) => trace.length;
  const scoped = scope(operation);
  expectTypeOf(scoped({ trace: 'typed' })).toEqualTypeOf<Promise<number>>();
  // @ts-expect-error A cancellation scope does not supply an unrelated trace.
  void scoped({});
  const refined: ContextOperation<
    { signal: AbortSignal & { special: true } },
    void
  > = async () => {};
  // @ts-expect-error The provider supplies an ordinary signal, not a refinement.
  scope(refined);
});

test('CASE-CANCEL-PROMISE-TYPES: source and promise expose their contracts', () => {
  const source = new AbortController();
  expectTypeOf(source.signal).toEqualTypeOf<AbortSignal>();
  source.abort(null);
  const promise = PromiseCancellable.from(Promise.resolve(1), {
    policy: 'request-only',
    controller: source,
  });
  expectTypeOf(promise).toExtend<Promise<number>>();
  expectTypeOf(
    promise.then((value, signal) => {
      expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
      return value.toString();
    }),
  ).toEqualTypeOf<PromiseCancellable<string>>();
  // @ts-expect-error Waiting policy is selected explicitly.
  void PromiseCancellable.from(Promise.resolve(1));
});

test('CASE-CANCEL-CONTROLLER-TYPES: public owner is a native controller', () => {
  const owner = new CancellationController();
  expectTypeOf(owner).toExtend<AbortController>();
  expectTypeOf(owner.signal).toEqualTypeOf<AbortSignal>();
  const detach = owner.link(new AbortController().signal);
  expectTypeOf(detach).toEqualTypeOf<() => void>();
  detach();
  owner.close();
  owner.abort('local');
});
