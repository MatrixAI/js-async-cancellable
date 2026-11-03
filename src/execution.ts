import type { ContextCancellation, ContextOperation, ContextScopeExit } from '@matrixai/contexts';
import type {
  CancellationExecution,
  CancellationGroup,
  CancellationGroupMode,
  CancellationGroupOptions,
  CancellationGroupResult,
  CancellationOptions,
  SharedCancellation,
} from './types.js';
import { bracketResource } from '@matrixai/contexts';
import { createCancellation } from './cancellation.js';
import { waitForPromise } from './waitForPromise.js';

/** Start exactly one owned execution; its body starts in a native microtask. */
function startCancellation<C extends object, T>(
  operation: ContextOperation<C & ContextCancellation, T>,
  context: C & Partial<ContextCancellation>,
  { inherit = true }: CancellationOptions = {},
): CancellationExecution<T> {
  const owned = createCancellation(inherit ? context.signal : undefined);
  const result = bracketResource(
    () => owned,
    ({ signal }) => {
      signal.throwIfAborted();
      return operation({ ...context, signal });
    },
    () => owned.close(),
  );
  const completion = observeCompletion(result);
  return Object.freeze({
    signal: owned.signal,
    result,
    completion,
    cancel: owned.cancel,
    wait: (signal?: AbortSignal) => waitForPromise(result, signal),
  });
}

/** A completion-safe boundary: a selected early result cannot escape its owner. */
async function completeCancellation<T>(execution: CancellationExecution<T>): Promise<T> {
  const outcome = await execution.completion;
  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}

function observeCompletion<T>(promise: Promise<T>): Promise<ContextScopeExit<T>> {
  return promise.then(
    (value) => Object.freeze({ status: 'fulfilled' as const, value }),
    (reason: unknown) => Object.freeze({ status: 'rejected' as const, reason }),
  );
}

/**
 * Inputs are factories owned by this invocation, not borrowed promise values.
 * Result selection may be early; completion always drains every started input.
 */
function startCancellationGroup<C extends object, T, M extends CancellationGroupMode>(
  mode: M,
  operations: Iterable<ContextOperation<C & ContextCancellation, T>>,
  context: C & Partial<ContextCancellation>,
  { inherit = true, cancelRemaining = 'never' }: CancellationGroupOptions = {},
): CancellationGroup<M, T> {
  if (!['all', 'allSettled', 'race', 'any'].includes(mode)) {
    throw new TypeError('Unknown cancellation group mode');
  }
  if (cancelRemaining !== 'never' && cancelRemaining !== 'on-selection') {
    throw new TypeError('Unknown remaining-execution policy');
  }
  // Finish iteration/validation before any execution or listener is acquired.
  const factories = Array.from(operations);
  if (factories.some((operation) => typeof operation !== 'function')) {
    throw new TypeError('Cancellation groups require operation factories');
  }
  const owned = createCancellation(inherit ? context.signal : undefined);
  const executions: Array<CancellationExecution<T>> = [];
  const observed: Array<ContextScopeExit<T>> = [];
  const contributors = new Set<number>();
  const stopReason = Object.freeze({ kind: 'owned-group-selection' });
  let resolveSelection!: (outcome: ContextScopeExit<unknown>) => void;
  const selection = new Promise<ContextScopeExit<unknown>>((resolve) => {
    resolveSelection = resolve;
  });
  let selected = false;
  let completed = 0;
  const select = (outcome: ContextScopeExit<unknown>, indices: readonly number[]) => {
    if (selected) return;
    selected = true;
    for (const index of indices) contributors.add(index);
    resolveSelection(Object.freeze(outcome));
    if (cancelRemaining === 'on-selection') owned.cancel(stopReason);
  };
  const record = (outcome: ContextScopeExit<T>, index: number) => {
    observed[index] = outcome;
    completed += 1;
    if (mode === 'race') select(outcome, [index]);
    if (mode === 'any' && outcome.status === 'fulfilled') {
      // Earlier candidate failures are expected inputs to first-success selection.
      select(outcome, observed.flatMap((entry, i) =>
        entry?.status === 'rejected' ? [i] : []).concat(index));
    }
    if (mode === 'all' && outcome.status === 'rejected') select(outcome, [index]);
    if (completed !== factories.length || selected) return;
    const indices = observed.map((_outcome, i) => i);
    if (mode === 'all') {
      select({ status: 'fulfilled', value: observed.map((entry) =>
        (entry as { status: 'fulfilled'; value: T }).value) }, indices);
    } else if (mode === 'allSettled') {
      select({ status: 'fulfilled', value: [...observed] }, indices);
    } else if (mode === 'any') {
      select({ status: 'rejected', reason: new AggregateError(
        observed.map((entry) => (entry as { status: 'rejected'; reason: unknown }).reason),
        'No execution fulfilled',
      ) }, indices);
    }
  };
  try {
    for (const operation of factories) {
      const execution = startCancellation(operation, { ...context, signal: owned.signal });
      const index = executions.length;
      executions.push(execution);
      void execution.completion.then((outcome) => record(outcome, index));
    }
    if (factories.length === 0) {
      if (mode === 'all' || mode === 'allSettled') {
        select({ status: 'fulfilled', value: [] }, []);
      } else {
        select({ status: 'rejected', reason: mode === 'any'
          ? new AggregateError([], 'No execution fulfilled')
          : new RangeError('An owning race requires at least one execution') }, []);
      }
    }
  } catch (reason) {
    // A failed later acquisition still leaves earlier executions owned here.
    owned.cancel(stopReason);
    select({ status: 'rejected', reason }, []);
  }
  const outcomes = Promise.all(executions.map((execution) => execution.completion))
    .then((entries) => Object.freeze(entries));
  const result = selection.then((outcome) => {
    if (outcome.status === 'rejected') throw outcome.reason;
    return outcome.value as CancellationGroupResult<M, T>;
  });
  // Owners may deliberately observe completion rather than the early result.
  void result.catch(() => {});
  const completedResult = bracketResource(
    () => owned,
    async () => {
      const entries = await outcomes;
      const outcome = await selection;
      const secondary: unknown[] = [];
      entries.forEach((entry, index) => {
        if (!contributors.has(index) && entry.status === 'rejected' && entry.reason !== stopReason) {
          secondary.push(entry.reason);
        }
      });
      if (secondary.length > 0) {
        const failure = secondary.length === 1 ? secondary[0]
          : new AggregateError(secondary, 'Additional owned execution failures');
        throw outcome.status === 'rejected'
          ? new SuppressedError(failure, outcome.reason) : failure;
      }
      if (outcome.status === 'rejected') throw outcome.reason;
      return outcome.value as CancellationGroupResult<M, T>;
    },
    () => owned.close(),
  );
  return Object.freeze({
    signal: owned.signal,
    result,
    completion: observeCompletion(completedResult),
    outcomes,
    cancel: owned.cancel,
    wait: (signal?: AbortSignal) => waitForPromise(result, signal),
  });
}

/** One signal spans stage handoff; an outstanding request prevents later entry. */
function startCancellationSequence<C extends object, T>(
  operations: Iterable<ContextOperation<C & ContextCancellation, T>>,
  context: C & Partial<ContextCancellation>,
  options?: CancellationOptions,
): CancellationExecution<T[]> {
  const factories = Array.from(operations);
  return startCancellation(async (inner) => {
    const values: T[] = [];
    for (const operation of factories) {
      inner.signal.throwIfAborted();
      values.push(await operation(inner));
    }
    return values;
  }, context, options);
}

/**
 * This function owns the source execution; subscribers receive only waits.
 * Last-departure cancellation permanently closes admission to this instance.
 */
function startSharedCancellation<C extends object, T>(
  operation: ContextOperation<C & ContextCancellation, T>,
  context: C & Partial<ContextCancellation>,
  options: CancellationOptions & { readonly whenIdle?: 'continue' | 'cancel' } = {},
): SharedCancellation<T> {
  const whenIdle = options.whenIdle ?? 'continue';
  if (whenIdle !== 'continue' && whenIdle !== 'cancel') {
    throw new TypeError('Unknown shared-execution idle policy');
  }
  const execution = startCancellation(operation, context, options);
  const idleReason = Object.freeze({ kind: 'last-subscriber-departed' });
  let subscribers = 0;
  let admissionClosed = false;
  return Object.freeze({
    ...execution,
    subscribe(signal?: AbortSignal): Promise<T> {
      if (admissionClosed) return Promise.reject(idleReason);
      if (signal?.aborted) return Promise.reject(signal.reason);
      subscribers += 1;
      return execution.wait(signal).finally(() => {
        subscribers -= 1;
        if (subscribers === 0 && whenIdle === 'cancel') {
          admissionClosed = true;
          execution.cancel(idleReason);
        }
      });
    },
  });
}

export {
  startCancellation,
  completeCancellation,
  startCancellationGroup,
  startCancellationSequence,
  startSharedCancellation,
};
