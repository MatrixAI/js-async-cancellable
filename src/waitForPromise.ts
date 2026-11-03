/**
 * Cancel only this wait. The input is borrowed: it is neither cancelled nor
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
    let observer: { resolve: typeof resolve; reject: typeof reject } | undefined =
      { resolve, reject };
    const finish = (fulfilled: boolean, result: unknown) => {
      if (!pending) return;
      pending = false;
      const current = observer!;
      observer = undefined;
      try {
        signal.removeEventListener('abort', abort);
      } catch (cleanup) {
        current.reject(fulfilled ? cleanup : new SuppressedError(cleanup, result));
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
      if (signal.aborted) abort();
      else {
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }
    } catch (reason) {
      finish(false, reason);
    }
  });
}

export { waitForPromise };
