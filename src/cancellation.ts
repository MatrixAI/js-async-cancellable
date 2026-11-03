import type { ContextCancellation, ContextScope } from '@matrixai/contexts';
import type { Cancellation, CancellationOptions } from './types.js';
import { bracketResource, createContextScope } from '@matrixai/contexts';

/**
 * Acquire one owned child. The provider must close it after all represented
 * work and cleanup complete, not merely when a caller abandons its wait.
 */
function createCancellation(
  upstream?: AbortSignal | readonly AbortSignal[],
): Cancellation {
  const parents: readonly AbortSignal[] = upstream == null ? [] :
    Array.isArray(upstream) ? [...new Set(upstream)] : [upstream as AbortSignal];
  const controller = new AbortController();
  const links: Array<readonly [AbortSignal, () => void]> = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const failures: unknown[] = [];
    for (const [parent, propagate] of links.splice(0)) {
      try { parent.removeEventListener('abort', propagate); }
      catch (reason) { failures.push(reason); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Cancellation unlink failures');
  };
  try {
    // Already-aborted inputs are arbitrated in caller-supplied input order.
    const aborted = parents.find((parent) => parent.aborted);
    if (aborted != null) controller.abort(aborted.reason);
    else for (const parent of parents) {
      const propagate = () => {
        if (!closed) controller.abort(parent.reason);
      };
      links.push([parent, propagate]);
      parent.addEventListener('abort', propagate, { once: true });
      // Also cover a structural signal that aborts during listener setup.
      if (parent.aborted) propagate();
    }
  } catch (primary) {
    try {
      close();
    } catch (cleanup) {
      throw new SuppressedError(cleanup, primary);
    }
    throw primary;
  }
  return Object.freeze({
    signal: controller.signal,
    cancel(reason?: unknown) {
      if (!closed) controller.abort(reason);
    },
    close,
  });
}

/** Construction is inert; each execution acquires independent child state. */
function createCancellationScope({ inherit = true }: CancellationOptions = {}): ContextScope<
  Partial<ContextCancellation>,
  ContextCancellation
> {
  return createContextScope<Partial<ContextCancellation>, ContextCancellation>(
    async (outer, body) => bracketResource(
      () => createCancellation(inherit ? outer.signal : undefined),
      ({ signal }) => body({ signal }),
      (owned) => owned.close(),
    ),
  );
}

export { createCancellation, createCancellationScope };
