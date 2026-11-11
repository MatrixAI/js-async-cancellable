import type { ContextCancellation } from '@matrixai/contexts';

interface PromiseLikeCancellable<T> extends PromiseLike<T> {
  cancel(reason?: unknown): void;
}

/** Owned authority for one child, never for its borrowed parent. */
type Cancellation = ContextCancellation & {
  readonly abort: (reason?: unknown) => void;
  /** End ownership after represented completion; does not signal abortion. */
  readonly close: () => void;
};

type CancellationLink = {
  readonly signal: AbortSignal;
  readonly propagate: () => void;
  references: number;
  active: boolean;
  installing: boolean;
  removing: boolean;
};

type PromiseCancellableOptions = {
  /** Early waiting abandons the input; request-only waits for its outcome. */
  readonly policy: 'early' | 'request-only';
  /** Supplying a controller intentionally shares cancellation authority. */
  readonly controller?: AbortController;
};

type CancellationOptions = {
  /** Omit the caller's propagation path deliberately, rather than clearing it. */
  readonly inherit?: boolean;
};

export type {
  Cancellation,
  CancellationLink,
  CancellationOptions,
  PromiseLikeCancellable,
  PromiseCancellableOptions,
};
