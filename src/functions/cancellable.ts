import type {
  ContextFunction,
  ContextFunctionOptions,
  ContextTransform,
} from '@matrixai/contexts';
import type { ContextFunctionCheck } from '@matrixai/contexts/functions/index.js';
import type { CancellationFunctionCheck } from './types.js';
import { bracketResource, scopeContextFunction } from '@matrixai/contexts';
import CancellationController from '../CancellationController.js';
import PromiseCancellable from '../PromiseCancellable.js';
import { createCancellationScope } from '../utils.js';

/**
 * Wrap an asynchronous operation with invocation-local cancellation authority.
 * Requests propagate to its scoped child, while the returned result retains body
 * completion and both the scope and link cleanup. The selected context is an
 * ordinary record; it is copied rather than mutated.
 */
function cancellable<
  This,
  Args extends unknown[],
  Result,
  const Position extends number | 'last',
>(
  operation: ContextFunction<This, Args, Result> &
    CancellationFunctionCheck<Args, Position>,
  options: ContextFunctionOptions<Position>,
): (this: This, ...args: Args) => PromiseCancellable<Result> {
  const transform = createCancellationScope() as unknown as ContextTransform<
    object,
    object
  >;
  const scoped = scopeContextFunction<object, This, Args, Result, Position>(
    operation as ContextFunction<This, Args, Result> &
      ContextFunctionCheck<Args, Position, object>,
    transform,
    options,
  );
  const position = options.context;
  function wrapped(this: This, ...args: Args): PromiseCancellable<Result> {
    const index = typeof position === 'number' ? position : args.length - 1;
    if (index < 0 || index >= args.length) {
      throw new RangeError('The selected context argument is missing');
    }
    const outer = args[index];
    assertContextRecord(outer);
    // Snapshot before acquiring the parent link: even a proxy that passes the
    // record checks can throw while its enumerable properties are being read.
    const snapshot = { ...outer } as { signal?: AbortSignal };
    const controller = new CancellationController(snapshot.signal);
    const forwarded: unknown[] = [...args];
    forwarded[index] = { ...snapshot, signal: controller.signal };
    const completion = bracketResource(
      () => controller,
      () => scoped.apply(this, forwarded as Args),
      (owned) => owned.close(),
    );
    return PromiseCancellable.from(completion, {
      policy: 'request-only',
      controller,
    }) as PromiseCancellable<Result>;
  }
  Object.defineProperty(wrapped, 'name', {
    value: operation.name,
    configurable: true,
  });
  return wrapped;
}

/** Match the ordinary-data projection accepted by a contexts scope. */
function assertContextRecord(value: unknown): asserts value is object {
  if (value == null || typeof value !== 'object') {
    throw new TypeError(
      'ContextScope projection requires an ordinary data record',
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) {
    throw new TypeError(
      'ContextScope projection does not clone object instances',
    );
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(
        'ContextScope projection requires enumerable own data fields',
      );
    }
  }
}

export { cancellable };
