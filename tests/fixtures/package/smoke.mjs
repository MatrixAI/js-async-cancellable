import assert from 'node:assert/strict';
import { createCancellation, createCancellationScope, PromiseCancellable, waitForPromise, startCancellationGroup, completeCancellation } from '@matrixai/async-cancellable';

const parent = new AbortController();
const owned = createCancellation(parent.signal);
const reason = { parent: true };
parent.abort(reason);
assert.equal(owned.signal.reason, reason);
owned.close();
const operation = createCancellationScope()(async ({ signal, trace }) => {
  assert.equal(signal.aborted, false);
  return trace;
});
assert.equal(await operation({ trace: 'packed' }), 'packed');
assert.equal(await PromiseCancellable.resolve(3), 3);
const abandoned = new AbortController();
abandoned.abort(reason);
await assert.rejects(waitForPromise(Promise.resolve(1), abandoned.signal), (failure) => failure === reason);
const all = startCancellationGroup('all', [async () => 1, async () => 2], {});
assert.deepEqual(await completeCancellation(all), [1, 2]);
