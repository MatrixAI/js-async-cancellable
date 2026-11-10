import type { ContextCancellation, ContextScope } from '@matrixai/contexts';
import type { CancellationOptions } from './types.js';
import { bracketResource, createContextScope } from '@matrixai/contexts';
import CancellationController from './CancellationController.js';

/**
 * Create a reusable contexts scope that supplies an independently owned signal.
 * Each invocation acquires a controller and retains its upstream link through
 * represented body work and mandatory cleanup, then closes the link. Detached
 * work is outside this boundary, and an abandoned wait does not close it early.
 *
 * An upstream signal is inherited by default; `inherit: false` shields that
 * path. A pre-aborted upstream reaches the body as an aborted child signal
 * rather than skipping body entry. If body and unlink both fail, the bracket
 * preserves both failures with cleanup as the primary SuppressedError value.
 */
function createCancellationScope({
  inherit = true,
}: CancellationOptions = {}): ContextScope<
  Partial<ContextCancellation>,
  ContextCancellation
> {
  return createContextScope<Partial<ContextCancellation>, ContextCancellation>(
    async (outer, body) =>
      bracketResource(
        () => new CancellationController(inherit ? outer.signal : undefined),
        ({ signal }) => body({ signal }),
        (owned) => owned.close(),
      ),
  );
}

/**
 * Cancel only this wait. The borrowed input is neither cancelled nor
 * joined. Its eventual rejection remains observed after wait abandonment.
 */
function waitForPromise<T>(
  value: T | PromiseLike<T>,
  signal?: AbortSignal,
): Promise<Awaited<T>> {
  const source = Promise.resolve(value);
  if (signal == null) return source;
  return new Promise<Awaited<T>>((resolve, reject) => {
    let pending = true;
    // Clear caller continuations after abandonment even if source never ends.
    let observer:
      { resolve: typeof resolve; reject: typeof reject } | undefined = {
      resolve,
      reject,
    };
    const finish = (fulfilled: boolean, result: unknown) => {
      if (!pending) return;
      pending = false;
      const current = observer!;
      observer = undefined;
      try {
        signal.removeEventListener('abort', abort);
      } catch (cleanup) {
        current.reject(
          fulfilled ? cleanup : new SuppressedError(cleanup, result),
        );
        return;
      }
      if (fulfilled) current.resolve(result as Awaited<T>);
      else current.reject(result);
    };
    const abort = () => finish(false, signal.reason);
    // Both callbacks return void and cannot reject their derived promise.
    void source.then(
      (result) => finish(true, result),
      (reason) => finish(false, reason),
    );
    try {
      if (signal.aborted) {
        abort();
      } else {
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }
    } catch (reason) {
      finish(false, reason);
    }
  });
}

export { createCancellationScope, waitForPromise };
