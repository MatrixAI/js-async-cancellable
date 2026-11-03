import type { ContextCancellation, ContextOperation, ContextScope } from '@matrixai/contexts';
import { createCancellation, createCancellationScope, PromiseCancellable, waitForPromise, startCancellationGroup, completeCancellation } from '@matrixai/async-cancellable';

const provide: ContextScope<Partial<ContextCancellation>, ContextCancellation> = createCancellationScope();
const operation: ContextOperation<ContextCancellation & { trace: string }, number> = async ({ signal, trace }) => signal.aborted ? 0 : trace.length;
const scoped = provide(operation);
const result: Promise<number> = scoped({ trace: 'typed' });
// @ts-expect-error The provider does not supply an outstanding trace capability.
scoped({});
const refined: ContextOperation<{ signal: AbortSignal & { special: true } }, void> = async () => {};
// @ts-expect-error A general child signal cannot supply a refined signal contract.
provide(refined);
const owned = createCancellation();
owned.cancel(null);
owned.close();
const facade: Promise<number> = PromiseCancellable.from(result);
const waiting: Promise<number> = waitForPromise(facade, owned.signal);
void waiting;
const group = startCancellationGroup('all', [operation], { trace: 'group' });
const complete: Promise<number[]> = completeCancellation(group);
const race = startCancellationGroup('race', [operation], { trace: 'race' });
const selected: Promise<number> = race.result;
void complete;
void selected;
