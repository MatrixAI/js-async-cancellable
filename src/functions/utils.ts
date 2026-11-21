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
    // Validate and snapshot before acquiring the parent link. Descriptor reads
    // do not invoke getters, but proxy traps can still fail during validation.
    const descriptors = contextDescriptors(args[index]);
    const parentSignal = descriptors.get('signal')?.value as
      AbortSignal | undefined;
    const controller = new CancellationController(parentSignal);
    const completion = bracketResource(
      () => controller,
      () => {
        const forwarded: unknown[] = [...args];
        forwarded[index] = projectContext(descriptors, controller.signal);
        return scoped.apply(this, forwarded as Args);
      },
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

/** Snapshot the ordinary own data accepted by a contexts scope. */
function contextDescriptors(
  value: unknown,
): Map<PropertyKey, PropertyDescriptor> {
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
  const descriptors = new Map<PropertyKey, PropertyDescriptor>();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor == null || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('ContextScope projection requires own data fields');
    }
    descriptors.set(key, descriptor);
  }
  return descriptors;
}

/** Replace the signal once, retaining the contexts scope descriptor policy. */
function projectContext(
  descriptors: Map<PropertyKey, PropertyDescriptor>,
  signal: AbortSignal,
): object {
  descriptors.set('signal', {
    value: signal,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const projected = {};
  for (const [key, descriptor] of descriptors) {
    Object.defineProperty(
      projected,
      key,
      descriptor.enumerable
        ? {
            value: descriptor.value,
            enumerable: true,
            writable: true,
            configurable: true,
          }
        : descriptor,
    );
  }
  return projected;
}

export { cancellable };
