import type { Cancellation, PromiseCancellableOptions } from './types.js';
import { createCancellation } from './cancellation.js';
import { waitForPromise } from './waitForPromise.js';

/**
 * A cancellable wait facade, not a structured-concurrency engine. Native chain
 * methods return ordinary promises. Executor resolution represents only the
 * value/thenable passed to resolve, never arbitrary detached executor work.
 */
class PromiseCancellable<T> implements Promise<T> {
  public readonly signal: AbortSignal;
  protected readonly owned: Cancellation;
  protected readonly promise: Promise<T>;

  public constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      signal: AbortSignal,
    ) => void,
    options: PromiseCancellableOptions = {},
  ) {
    const mode = options.cancellation ?? 'reject';
    if (mode !== 'reject' && mode !== 'request') {
      throw new TypeError('Unknown cancellation policy');
    }
    this.owned = createCancellation(options.signal);
    this.signal = this.owned.signal;
    const source = new Promise<T>((resolve, reject) => {
      executor(resolve, reject, this.signal);
    });
    // Linking lasts through represented source settlement, not early rejection.
    const completion = source.then(
      (value) => {
        this.owned.close();
        return value;
      },
      (primary) => {
        try {
          this.owned.close();
        } catch (cleanup) {
          throw new SuppressedError(cleanup, primary);
        }
        throw primary;
      },
    );
    this.promise =
      mode === 'request' ? completion : waitForPromise(completion, this.signal);
  }

  public static resolve(): PromiseCancellable<void>;
  public static resolve<T>(
    value: T | PromiseLike<T>,
  ): PromiseCancellable<Awaited<T>>;
  public static resolve<T>(
    value?: T | PromiseLike<T>,
  ): PromiseCancellable<Awaited<T> | void> {
    return PromiseCancellable.from(Promise.resolve(value));
  }

  public static reject<T = never>(reason?: unknown): PromiseCancellable<T> {
    return new PromiseCancellable<T>((_resolve, reject) => reject(reason));
  }

  public static from<T>(
    value: T | PromiseLike<T>,
    options?: PromiseCancellableOptions,
  ): PromiseCancellable<Awaited<T>> {
    return new PromiseCancellable<Awaited<T>>((resolve, reject) => {
      void Promise.resolve(value).then(resolve, reject);
    }, options);
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
    return PromiseCancellable.from(Promise.all(values));
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
    return PromiseCancellable.from(Promise.allSettled(values));
  }

  public static race<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<Awaited<T>> {
    return PromiseCancellable.from(Promise.race(values));
  }

  public static any<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): PromiseCancellable<Awaited<T>> {
    return PromiseCancellable.from(Promise.any(values));
  }

  public get [Symbol.toStringTag](): string {
    return 'PromiseCancellable';
  }

  public cancel(reason?: unknown): void {
    this.owned.cancel(reason);
  }

  public then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onFulfilled, onRejected);
  }

  public catch<TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.promise.catch(onRejected);
  }

  public finally(onFinally?: (() => void) | null): Promise<T> {
    return this.promise.finally(onFinally);
  }
}

export default PromiseCancellable;
