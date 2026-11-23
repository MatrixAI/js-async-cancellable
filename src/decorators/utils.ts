import type {
  ContextFunction,
  ContextFunctionOptions,
} from '@matrixai/contexts';
import type { CancellationFunctionCheck } from '../functions/types.js';
import { cancellable as cancellableFunction } from '../functions/index.js';

/** Standard method decorator over the same functional cancellation policy. */
function cancellable<const Position extends number | 'last'>(
  options: ContextFunctionOptions<Position>,
) {
  return function decorate<This, Args extends unknown[], Result>(
    method: ContextFunction<This, Args, Result> &
      CancellationFunctionCheck<Args, Position>,
    metadata: ClassMethodDecoratorContext<
      This,
      ContextFunction<This, Args, Result>
    >,
  ): ContextFunction<This, Args, Result> {
    if (metadata.kind !== 'method') {
      throw new TypeError(
        'cancellable supports standard method decorators only',
      );
    }
    return cancellableFunction(method, options);
  };
}

export { cancellable };
