import type { ContextCancellation, ContextScopeExit } from '@matrixai/contexts';

interface PromiseLikeCancellable<T> extends PromiseLike<T> {
  cancel(reason?: unknown): void;
}

/** Owned authority for one child, never for its borrowed parent. */
type Cancellation = ContextCancellation & {
  readonly cancel: (reason?: unknown) => void;
  /** End ownership after represented completion; does not signal abortion. */
  readonly close: () => void;
};

type PromiseCancellableOptions = {
  readonly signal?: AbortSignal;
  /** Default: reject this wait. Request mode waits for executor settlement. */
  readonly cancellation?: 'reject' | 'request';
};

type CancellationOptions = {
  /** Omit the caller's propagation path deliberately, rather than clearing it. */
  readonly inherit?: boolean;
};

/** The result may settle early; completion always retains owned represented work. */
type CancellationExecution<T> = ContextCancellation & {
  readonly result: Promise<T>;
  readonly completion: Promise<ContextScopeExit<T>>;
  readonly cancel: (reason?: unknown) => void;
  readonly wait: (signal?: AbortSignal) => Promise<T>;
};

type CancellationGroupMode = 'all' | 'allSettled' | 'race' | 'any';

type CancellationGroupResult<M extends CancellationGroupMode, T> =
  M extends 'all' ? T[] :
  M extends 'allSettled' ? ContextScopeExit<T>[] : T;

type CancellationGroupOptions = CancellationOptions & {
  /** Only owned executions are eligible; never inferred from result selection. */
  readonly cancelRemaining?: 'never' | 'on-selection';
};

type CancellationGroup<M extends CancellationGroupMode, T> =
  CancellationExecution<CancellationGroupResult<M, T>> & {
    readonly outcomes: Promise<readonly ContextScopeExit<T>[]>;
  };

type SharedCancellation<T> = CancellationExecution<T> & {
  readonly subscribe: (signal?: AbortSignal) => Promise<T>;
};

export type {
  Cancellation,
  CancellationOptions,
  CancellationExecution,
  CancellationGroupMode,
  CancellationGroupResult,
  CancellationGroupOptions,
  CancellationGroup,
  SharedCancellation,
  PromiseLikeCancellable,
  PromiseCancellableOptions,
};
