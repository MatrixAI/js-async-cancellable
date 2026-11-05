# js-async-cancellable

Cancellation providers and explicit asynchronous execution composition.

## Version 3 compatibility

Version 3 is a breaking redesign against released contexts v3.0.0. Consumers of
the version 2 controller/chaining contract must migrate deliberately; changing
their dependency alone is not sufficient. Git-only distribution does not imply
npm publication or release of any downstream package.

```sh
npm install --save 'git+ssh://git@github.com/MatrixAI/js-async-cancellable.git#v3.0.0'
```

The self-contained
[execution semantics](specs/0001-execution-ontology-and-semantics/adr.md) is
proposed. Implementation, bounded verification, requirement satisfaction,
decision acceptance, and release approval remain separate.

## Vocabulary and ownership

An operation is deferred work; invoking it starts one execution. A scope owns
its declared obligations through represented work and required cleanup. A waiter
may leave before an execution finishes. Observing a signal does not grant
authority to cancel its source.

An owned cancellation source can link to a borrowed upstream signal. Upstream
abortion reaches that source with the exact reason; local cancellation does not
abort upstream or another independently owned source. Parent/child is only
shorthand for this named cancellation relationship, not a universal task tree.

`createCancellation(upstream)` returns an owned handle with `signal`, `cancel`,
and `close`. An array of upstream signals selects any-source fan-in: the first
observed request wins; already-aborted inputs are selected in input order.
Duplicate inputs install one link. Closing unlinks idempotently, does not abort
anything, and disables new requests through that handle. The caller must close
only after its represented work and mandatory cleanup finish.

`createCancellationScope()` is the reusable contexts provider. Each invocation
owns a separate source and retains its links through the returned operation's
actual completion. The body receives a new signal even when upstream is already
aborted, so it can implement its own admission policy. Selecting
`inherit: false` explicitly shields that propagation path; it does not clear
upstream abortion.

## Owned execution

```ts
import {
  startCancellation,
  completeCancellation,
} from '@matrixai/async-cancellable';

const execution = startCancellation(
  async ({ signal, trace }) => {
    signal.throwIfAborted();
    return trace.length;
  },
  { trace: 'request' },
);

const value = await completeCancellation(execution);
```

`startCancellation` begins the body in a native microtask, skips body entry if
its effective signal is already aborted, and retains links through represented
body completion. Its handle exposes:

- `result`: The selected result promise.
- `completion`: An always-fulfilled, immutable fulfillment/rejection outcome
  recording owned completion, including mandatory represented cleanup.
- `signal` and `cancel(reason)`: Local cancellation observation and authority.
- `wait(waitingSignal)`: A separately cancellable wait, without cancelling work.

`completeCancellation(handle)` waits for actual completion and unwraps its
outcome. An owner must retain this boundary even after an early result or an
abandoned wait. Cancellation is cooperative: non-cooperative represented work
can keep completion pending indefinitely. Detached work not returned or awaited
by the operation is not magically supervised or joined.

## Execution compositions

`startCancellationGroup(mode, operations, context, options)` accepts operation
factories whose executions it owns. It fully consumes and validates the iterable
before acquiring any execution; bodies then start in native microtasks in input
order. It does not accept promises as implicitly owned inputs.

| Mode         | Result                                                        | Completion                                                                                                                        |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `all`        | All values in input order, or first observed failure.         | Drains all owned inputs; additional failures are retained.                                                                        |
| `allSettled` | Every immutable fulfillment/rejection outcome in input order. | Drains all; candidate failures are explicit result data.                                                                          |
| `race`       | First observed settlement.                                    | Drains losers; unexpected loser failures remain owner-visible.                                                                    |
| `any`        | First success, or input-ordered aggregate failure.            | Drains all; failures observed before success are expected selection inputs, while later unexpected failures remain owner-visible. |

The default `cancelRemaining: 'never'` lets remaining owned work continue, while
still retaining its completion. Selecting `'on-selection'` requests cancellation
of still-active inputs after result selection. It never declares those inputs
finished. Internal selection cancellation is recognizable as an expected
outcome; its exact value remains available in `outcomes`. All other secondary
failures are retained in input order, without deduplicating identical rejection
values. If both selection and secondary failures exist, completion preserves
both using suppression. A late failure cannot retroactively change an already
delivered result.

Empty `all` and `allSettled` fulfill with empty arrays. Empty `any` rejects with
an empty aggregate. Empty owning `race` rejects with a range error rather than
holding an empty region open forever. Borrowed native promise combinators keep
their native empty-input behavior.

`startCancellationSequence` retains one effective signal across stage handoff,
checks it before each stage, and returns the values in stage order. A request
during a handoff prevents later startup. To select a different recovery or
shielding policy, compose an explicitly owned scope rather than clear a signal.

`startSharedCancellation` owns one source execution. Subscribers receive only
their own waits. The default `whenIdle: 'continue'` retains the source when a
subscriber leaves. With `'cancel'`, final departure closes subscription
admission and requests cancellation; later subscriptions are rejected, without
restarting the source. The owner still retains completion if the source ignores
cancellation. Subscriber admission and departure transitions are synchronous
within this JavaScript execution agent. No cross-agent shared-memory membership
is promised.

All-source/quorum signal policies, cross-agent supervision, and automatic
ownership transfer to a detached region are not implemented by this API.

## Borrowed promises and migration

`waitForPromise(value, signal)` allows only wait abandonment. It does not call a
borrowed value's cancellation method or release it. It continues observing an
eventual rejection after the waiter leaves.

`PromiseCancellable` remains a cancellable-wait facade, not an execution engine.
Its explicit `cancellation` option is `'reject'` by default, or `'request'` to
retain executor-represented settlement after a request. Registering a listener
does not change that policy. It is promise-compatible, not a native Promise
subclass. Chain methods return ordinary promises and callbacks receive ordinary
native arguments. Static result combinators borrow their inputs and do not
cancel them.

| Previous mechanism                                           | Explicit replacement                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Inject a controller to select implicit cancellation behavior | Use source ownership and explicit facade options or an owned execution.      |
| Forward cancellation through chained signal callbacks        | Use owned operation factories and a sequence, or an explicitly linked scope. |
| Cancel a result aggregate and manually cancel its members    | Use an owning execution group with declared remaining-work policy.           |
| Early rejection used as completion                           | Retain the execution completion handle and required cleanup.                 |
| Forward a shared waiter's cancellation to the source         | Use subscriber-local waiting and an explicit source-owner idle policy.       |
| Rewrite cancellation-shaped errors to undefined              | Preserve arbitrary reasons; no-reason cancellation uses the native default.  |

Existing lock/timer consumers need deliberate migration; ordinary native
chaining is not a replacement for their cancellation and ownership semantics.

## Development and package production

Use Node.js 24 or newer. The package emits one ES2022/NodeNext ESM artifact.
Source imports are relative; tests run through the compiled package mapping.

```sh
nix run '.#npm' -- install --ignore-scripts --no-audit --fund=false --prefer-offline
npm run check:conformance
nix build '.#npm-package' '.#checks.x86_64-linux.verify' --no-link
```

Run installation from the repository's physical working directory, without a
prefix override through a sibling-workspace symlink. Prepared installation
preserves canonical Git specifications and exact commit resolutions. Recovery
copies, including attempted manifests on recovery failure, remain under `tmp/`.

The flake consumes contexts from its npm-lock-selected commit, validates the
producer descriptor, and supplies the same prepared archive to native npm and
the hermetic import adapter. There is no second contexts flake input/pin graph.
The producer exports the canonical npm archive, an unpacked view, package
metadata, and direct runtime-provider descriptors. It does not bundle runtime
dependencies or rewrite its packed manifest to local/store coordinates.

The integrated development environment and independent Nix checks share package
scripts, not mutable state. Activation does not load credentials or change shell
options. Lint is supplied by the selected package set; it remains paused for the
current implementation batch. Historical generated API documentation is not the
candidate contract and is excluded from the package.
