import type { PromiseCancellableOptions } from './types.js';
import { waitForPromise } from './utils.js';

/**
 * A native promise with cooperative cancellation authority. Construction alone
 * does not reject the promise when cancellation is requested: the executor must
 * observe the signal and decide how to respond. Native resolving functions
 * commit once, including when adopting a thenable; detached work is not
 * represented by this promise.
 *
 * Continuations have independent controllers by default and receive the result's
 * signal. Native result combinators borrow their inputs; they do not own or
 * cancel them. Use `from` to select an explicit waiting policy.
 */
class PromiseCancellable<T> extends Promise<T> {
  public readonly signal: AbortSignal;
  protected readonly controller: AbortController;

  public static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  /**
   * Start the executor with this promise's signal. Supplying a controller shares
   * its exact authority and signal, including after promise settlement.
   */
  public constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      signal: AbortSignal,
    ) => void,
    controller: AbortController = new AbortController(),
  ) {
    if (typeof executor !== 'function') {
      throw new TypeError('Promise executor must be a function');
    }
    super((resolve, reject) => {
      executor(resolve, reject, controller.signal);
    });
    this.controller = controller;
    this.signal = controller.signal;
  }

  public static resolve(): PromiseCancellable<void>;
  public static resolve<T>(
    value: T | PromiseLike<T>,
  ): PromiseCancellable<Awaited<T>>;
  public static resolve<T>(
    value?: T | PromiseLike<T>,
  ): PromiseCancellable<Awaited<T> | void> {
    return super.resolve(value) as PromiseCancellable<Awaited<T> | void>;
  }

  public static reject<T = never>(reason?: unknown): PromiseCancellable<T> {
    return super.reject(reason) as PromiseCancellable<T>;
  }

  /**
   * Create a waiting boundary over a borrowed value or promise-like input.
   * `request-only` waits for the input despite a request; `early` can reject the
   * wait on a request without cancelling or joining the input. A late rejection
   * remains observed, but is not delivered as a separate completion outcome.
   * Owners needing that outcome must retain the original work or another
   * completion-bearing result. A supplied controller shares its exact authority.
   */
  public static from<T>(
    value: T | PromiseLike<T>,
    options: PromiseCancellableOptions,
  ): PromiseCancellable<Awaited<T>> {
    if (options?.policy !== 'early' && options?.policy !== 'request-only') {
      throw new TypeError('A valid waiting policy is required');
    }
    const controller = options.controller ?? new AbortController();
    const result =
      options.policy === 'early'
        ? waitForPromise(value, controller.signal)
        : Promise.resolve(value);
    return new this<Awaited<T>>((resolve, reject) => {
      void result.then(resolve, reject);
    }, controller);
  }

  public static all<T extends readonly unknown[] | []>(
    values: T,
  ): PromiseCancellable<{
    -readonly [P in keyof T]: Awaited<T[P]>;
  }>;
  public static all<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<Awaited<T>[]>;
  public static all<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<Awaited<T>[]> {
    return super.all(values) as PromiseCancellable<Awaited<T>[]>;
  }

  public static allSettled<T extends readonly unknown[] | []>(
    values: T,
  ): PromiseCancellable<{
    -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>;
  }>;
  public static allSettled<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<PromiseSettledResult<Awaited<T>>[]>;
  public static allSettled<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<PromiseSettledResult<Awaited<T>>[]> {
    return super.allSettled(values) as PromiseCancellable<
      PromiseSettledResult<Awaited<T>>[]
    >;
  }

  public static race<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<Awaited<T>> {
    return super.race(values) as PromiseCancellable<Awaited<T>>;
  }

  public static any<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<Awaited<T>> {
    return super.any(values) as PromiseCancellable<Awaited<T>>;
  }

  public get [Symbol.toStringTag](): string {
    return 'PromiseCancellable';
  }

  /**
   * Request abortion of this promise's controller without forcing settlement or
   * completion. With a shared controller, observers share this request even if
   * the promise has already settled.
   */
  public cancel(reason?: unknown): void {
    this.controller.abort(reason);
  }

  /**
   * Create a continuation with independent cancellation authority by default.
   * Callbacks receive its signal; a request alone does not skip them or cancel
   * the parent. Supplying a controller shares that authority with the result.
   * Continuations return the base cancellable promise; this method does not
   * preserve the identity of a subclass of this class.
   */
  public then<TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T, signal: AbortSignal) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?:
      | ((reason: any, signal: AbortSignal) => TResult2 | PromiseLike<TResult2>)
      | null,
    controller: AbortController = new AbortController(),
  ): PromiseCancellable<TResult1 | TResult2> {
    const next = super.then(
      typeof onFulfilled === 'function'
        ? (value) => onFulfilled(value, controller.signal)
        : undefined,
      typeof onRejected === 'function'
        ? (reason) => onRejected(reason, controller.signal)
        : undefined,
    );
    return new PromiseCancellable<TResult1 | TResult2>((resolve, reject) => {
      void next.then(resolve, reject);
    }, controller);
  }

  /** Create a rejection continuation with the same authority policy as `then`. */
  public catch<TResult = never>(
    onRejected?:
      | ((reason: any, signal: AbortSignal) => TResult | PromiseLike<TResult>)
      | null,
    controller?: AbortController,
  ): PromiseCancellable<T | TResult> {
    return this.then(undefined, onRejected, controller);
  }

  /**
   * Create a finalizing continuation with the same authority policy as `then`.
   * An asynchronous finalizer remains part of the returned result.
   */
  public finally(
    onFinally?: ((signal: AbortSignal) => void) | null,
    controller?: AbortController,
  ): PromiseCancellable<T> {
    if (typeof onFinally !== 'function') {
      return this.then(undefined, undefined, controller);
    }
    return this.then(
      (value, signal) => Promise.resolve(onFinally(signal)).then(() => value),
      (reason, signal) =>
        Promise.resolve(onFinally(signal)).then(() => {
          throw reason;
        }),
      controller,
    );
  }
}

export default PromiseCancellable;
