# js-async-cancellable

Cancellation-aware promises and a reusable cancellation provider.

## Compatibility and status

Version 4 consumes the contexts v4.0.0 Git producer. It breaks version 3 APIs
and behavior: the owned-execution helpers and public waiting helper are removed,
and promise construction, waiting, and continuation semantics have changed. A
dependency upgrade is not a substitute for consumer migration and verification.
This version is not a release or publication authorization for subsequent
changes. The named facade additions below are unreleased.

Version 3 was a breaking redesign against contexts v3.0.0. Consumers of the
version 2 controller/chaining contract must migrate deliberately. The current
[specification index](specs/README.md) distinguishes accepted local decisions
from the withdrawn historical execution-ontology proposal. Decision acceptance,
implementation evidence, requirement satisfaction, and release approval remain
separate.

## Vocabulary and ownership

An operation is deferred work; invoking it starts one execution. A scope owns
its declared obligations through represented work and required cleanup. A waiter
may leave before an execution finishes. Observing a signal does not grant
authority to cancel its source.

An owned cancellation source can link to a borrowed upstream signal. Upstream
abortion reaches that source with the exact reason; local cancellation does not
abort upstream or another independently owned source. Parent/child is only
shorthand for this named cancellation relationship, not a universal task tree.

A native `AbortController` supplies authority to request cancellation; its
signal alone does not. Passing a controller to a promise shares that exact
controller and signal, including the ability to abort it after the promise
settles.

`CancellationController` extends the native controller and owns directional
links from upstream signals. Its `link(signal)` returns a detach function, so a
long-lived object can manage each relationship across multiple operations.
Duplicate attachments share one physical listener and detach independently.
`close()` disables forwarding and releases all links without aborting the local
signal. Failed removal is observable and may be retried; neither abortion nor
close proves that represented work or cleanup has finished. While an owner is
open and not already aborted, reentrant attachment to a signal during listener
installation or removal is rejected. A close encountered during removal reports
that incomplete cleanup.

`createCancellationScope()` is the reusable contexts provider. Each invocation
owns a separate source and retains its links through the returned operation's
actual completion. The body receives a new signal even when upstream is already
aborted, so it can implement its own admission policy. Selecting
`inherit: false` explicitly shields that propagation path; it does not clear
upstream abortion.

### Named cancellation authoring forms

The unreleased function and standard method forms select a required ordinary
context argument explicitly. Each invocation links a local cancellation source
to the borrowed parent signal and retains work and cleanup until completion:

```ts
import { cancellable } from '@matrixai/async-cancellable/functions';
import { cancellable as cancellableMethod } from '@matrixai/async-cancellable/decorators';

type Context = { trace: string; signal?: AbortSignal };
const read = cancellable(async (context: Context) => context.trace, {
  context: 0,
});
const result = read({ trace: 'request' });
result.cancel('requested');
await result;

class Service {
  @cancellableMethod({ context: 0 })
  async read(context: Context): Promise<string> {
    return context.trace;
  }
}
```

A request does not itself settle the returned promise or abort the parent. A
decorated method keeps its declared TypeScript return type even though the
runtime result is cancellable. The adapter preserves the original call signature
and does not subtract supplied requirements. It accepts finite required argument
tuples, not optional selected arguments or rest positions.

## Promise waiting and migration

`PromiseCancellable` is a native promise subclass, not an execution engine.
Direct construction makes cancellation a cooperative request; it cannot override
a native resolving function that has already committed to a value or thenable.
Registering a signal listener does not select a waiting policy. Chain callbacks
receive the chain result's signal, with independent controllers by default.
Continuations return the base cancellable promise rather than preserving a
consumer subclass. Static result combinators borrow their inputs and do not
cancel them.

`PromiseCancellable.from(work, { policy: 'early' })` creates an early waiting
boundary. Cancelling it can reject the wait while borrowed work continues. Use
`{ policy: 'request-only' }` to wait for the input outcome despite a request.
The owner must retain a separate completion-bearing result if early waiting
could otherwise hide work or cleanup. The accepted waiting and completion
decision does not establish downstream integration or authorize release.

The provider does not supply the earlier owned-execution, group, sequence, or
shared-subscription APIs. Native result combinators select results but do not
replace those APIs' ownership, cancellation, or completion policies.

| Previous mechanism                                           | Explicit replacement                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Inject a controller to select implicit cancellation behavior | Select waiting explicitly; a supplied native controller shares authority.   |
| Forward cancellation through chained signal callbacks        | Pass a selected signal explicitly; independent chains do not auto-link.     |
| Cancel a result aggregate and manually cancel its members    | Define ownership and cancellation in the application or its provider.       |
| Early rejection used as completion                           | Retain and await the actual work and mandatory cleanup separately.          |
| Forward a shared waiter's cancellation to the source         | Define a source-owner policy rather than inferring it from a borrowed wait. |
| Rewrite cancellation-shaped errors to undefined              | Preserve arbitrary reasons; no-reason cancellation uses the native default. |

Existing lock and timer consumers need deliberate migration. The timer's prior
eager/lazy options and custom-controller bypass require explicit review and
consumer evidence; the candidate does not establish their replacement yet.

## Iteration and provider boundaries

Wrapping a generator's creation in a cancellation scope does not keep its signal
linked while a caller later advances the generator. Keep consumption inside the
scope, or explicitly own the cancellation source through the generator's
terminal completion and cleanup. A suspended generator that is abandoned may
retain ownership indefinitely; cleanup that yields can require further explicit
advancement. Borrowing an iterator does not acquire its cancellation authority.

Contexts supplies the generic function and method adapters. Applications select
their transformation and ordering; cancellation does not grant lifecycle
admission, schedule a timer, or prove a timer handler has finished. Ambient
transport and inspection are optional and are not required by this provider. The
scope projects ordinary enumerable data records only. It cannot accept an
already-admitted lifecycle context with non-enumerable metadata. Apply
projection before admission, or use a provider-selected exact transformation
with a valid lifecycle policy; do not copy hidden admission authority. Real
lifecycle-provider integration remains unverified.

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
scripts, not mutable state. Activation does not install dependencies, load
credentials, or change shell options. Lint is supplied by the selected package
set; use `matrixai-lint --fix` for development or `matrixai-lint --check` for
verification. Historical generated API documentation is not the candidate
contract and is excluded from the package.
