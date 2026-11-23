---
title: Execution ontology and composition semantics
description:
  Self-contained vocabulary and rules separating result selection, cancellation
  propagation, ownership, admission, timing, and actual completion.
type: adr
category: architecture
tags: [execution, ontology, cancellation, composition, ownership, completion]
status: deprecated
created: 2026-11-03
updated: 2026-11-10
author: Matrix AI
project: js-async-cancellable
technologies: [TypeScript, JavaScript, Node.js]
audience: [developers, maintainers]
---

# ADR-0001: Execution ontology and composition semantics

## Status

Withdrawn without being accepted. The shared edition, its replication rules,
candidate requirements, and planned cases are historical and are not binding. No
single successor replaces this record. The current local decisions are
[cancellation and waiting](../0002-cancellation-and-waiting/adr.md) and
[owned execution](../0003-owned-execution/adr.md). They select their own scope
and do not adopt the withdrawn edition by implication.

## Context

### Background and Problem Statement

Cancellation and timing APIs participate in sequential, concurrent, racing, and
shared-work compositions. A tree-shaped parent/child explanation describes some
links but does not describe the whole execution model. A shorter API can
silently lose necessary behavior if it collapses cancellation forwarding, result
selection, and completion into ordinary promise settlement.

This record contains its own definitions, normative clauses, policy vocabulary,
and planned cases. No other specification is required to interpret it. Shared
semantic text is replicated into participating repositories rather than imported
through cross-specification references. Repository-specific adoption is stated
separately below the shared text.

## Decision Drivers

### Primary Decision Drivers

- Preserve useful asynchronous composition without accidental ownership
  transfer.
- Make cancellation, waiting, work settlement, and cleanup distinguishable.
- Keep specialized providers authoritative for their own invariants.

### Secondary Decision Drivers

- Prefer ordinary native-async interfaces without requiring a universal runtime.
- Make semantic copies independently readable and their drift reviewable.
- State conditional laws and executable counterexamples rather than global
  claims.

## Considered Options

### Option 1: Describe every relationship as parent and child

**Advantages:** Simple explanation for nested cancellation links.

**Disadvantages:** Conflates shared work, ownership, result dependencies, and
cancellation direction; cannot explain many-to-one relationships precisely.

**Risk Assessment:** High risk of premature cleanup and unintended propagation.

### Option 2: Require one task graph runtime for every provider

**Advantages:** One engine could track the executions it creates.

**Disadvantages:** Imposes a carrier and interpreter; cannot retroactively own
opaque promises or detached effects; displaces specialized provider invariants.

**Risk Assessment:** Excessive coupling and unsupported completion claims.

### Option 3: Share explicit semantics while retaining provider-owned engines

**Advantages:** Supports native async interfaces, explicit policy, independent
providers, and precise ownership boundaries.

**Disadvantages:** Requires deliberate policies, migration witnesses, and review
of replicated semantic editions.

**Risk Assessment:** Bounded if completion and authority remain explicit.

## Decision

The following is the historical proposal, not an accepted decision or a current
source of obligations.

Propose option 3. The following shared semantic section is complete in this
record. Its edition identifies meaning, not an npm version, runtime protocol
object, or universal conformance certificate.

<!-- shared-execution-semantics: execution-semantics-1 begin -->

### Semantic scope and vocabulary

The words MUST, MUST NOT, SHOULD, and SHOULD NOT express normative obligations.
Every requirement in this shared section has requirement status target and
evidence status unevidenced until repository-local evidence is reviewed. These
definitions specify behavior, not mandatory classes, fields, or runtime objects.

| Term                  | Meaning                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Capability            | An available operation or facility, with its provider's validity and authority conditions.                                            |
| Requirement           | A structural description of capabilities an operation needs.                                                                          |
| Operation             | A deferred context-dependent computation; construction alone does not invoke it.                                                      |
| Execution             | One invocation of an operation, including the work it represents; not necessarily a separately scheduled task.                        |
| Operator              | A reusable transformation of operations, possibly changing input requirements or selected results.                                    |
| Context               | Explicit execution input containing capabilities and data; references alone establish neither ownership nor admission.                |
| Context derivation    | Explicit inheritance, replacement, narrowing, or intentional omission of execution input.                                             |
| Scope                 | A boundary retaining its declared obligations through represented work and mandatory cleanup.                                         |
| Owner                 | The participant responsible for a declared resource's release or an execution's completion obligations.                               |
| Borrower              | A participant allowed to use a facility without thereby acquiring release or cancellation authority.                                  |
| Cancellation source   | State together with authority to request cancellation of its designated execution or group.                                           |
| Cancellation signal   | Observation of a cancellation request and its reason, not authority to cancel the source.                                             |
| Cancellation link     | An explicitly selected directed propagation rule between cancellation sources/signals.                                                |
| Upstream / downstream | Direction relative to a named propagation link, not a universal ancestry relation.                                                    |
| Waiter                | An observer of a result whose waiting lifetime may end independently of the underlying execution.                                     |
| Result settlement     | Availability of the fulfillment or rejection selected for a particular result observer.                                               |
| Work settlement       | Fulfillment or rejection of the underlying work represented at the named boundary.                                                    |
| Actual completion     | Work settlement plus completion of all mandatory cleanup and owned-completion obligations at that boundary.                           |
| Admission             | Provider-validated permission to enter an operation on a lifecycle participant.                                                       |
| Completion lease      | Provider-owned accounting that retains protection for admitted represented work until its required completion boundary.               |
| Deadline constraint   | An absolute bound in an identified clock domain, distinct from a scheduler or owned timer.                                            |
| Supervision           | Explicit authority and policy for starting, observing, requesting cancellation of, and retaining completion of designated executions. |

Parent and child MAY describe a specifically named nesting or propagation
relationship. They MUST NOT stand alone as names for result dependencies,
ownership, admission, or every execution relationship. In cancellation prose,
prefer owned cancellation source, borrowed upstream signal, and directed link.
Multiple downstream signals may observe one upstream signal; one source may
combine several upstream requests. Neither relationship implies task spawning.

### Independent relationships and observable events

Each composition distinguishes these relationships even when one implementation
uses the same objects to represent several of them:

- Result dependencies: which outcomes determine a selected result.
- Cancellation propagation: which requests reach which designated executions.
- Ownership and borrowing: who may cancel, retain, release, or transfer a
  resource.
- Completion obligations: which represented executions and cleanup must finish.
- Admission: which participant authorizes and protects each admitted call.
- Context derivation: which capabilities and constraints an invocation receives.

These relationships need not form the same graph. Scope nesting does not prove
that shared-work or cancellation relationships form a tree. Cycles and repeated
links require an explicit reentrancy/termination policy, not recursive unbounded
forwarding or an assumption that every graph is acyclic.

Observable events include invocation, admission, request issuance, signal
observation, result selection, result settlement, work settlement, cleanup
start, cleanup finish, release, and actual completion. Their order is a partial
order: unrelated concurrent events have no claimed global order. A selected
result may settle before owned losers complete; an owner must still retain those
completion obligations. Resource use may not occur after its valid release
boundary.

<a id="REQ-EXEC-RELATIONS-001"></a>

### REQ-EXEC-RELATIONS-001 - Relationships do not grant each other's authority

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A composition MUST NOT infer cancellation authority, release ownership,
admission, or completion from observing a result, containing a context
reference, sharing a signal, or participating in a result combinator. An
explicit contract must establish each authority or obligation separately.

<a id="REQ-EXEC-COMPLETION-001"></a>

### REQ-EXEC-COMPLETION-001 - Completion is boundary-relative and retained

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A scope or provider claiming ownership MUST retain represented work and required
cleanup until actual completion at its declared boundary. Result settlement,
cancellation requests, timeout, and waiter abandonment MUST NOT discharge that
obligation. Early-result APIs MUST provide a documented way for the owner to
retain and observe actual completion without re-running the execution. A single
completion-safe return value is also valid; two handles are not universally
required. Non-cooperative work may prevent completion indefinitely.

<a id="REQ-EXEC-REPRESENTATION-001"></a>

### REQ-EXEC-REPRESENTATION-001 - Representation has honest limits

Level: MUST. Requirement status: target. Evidence status: unevidenced.

An adapter MUST state which returned work, thenables, spawned executions, and
cleanup it represents. It MUST NOT claim to join detached work, infer execution
completion from an arbitrary promise executor's return, or supervise opaque
effects merely by wrapping a result. Work extending beyond a scope requires
explicit ownership transfer or a longer-lived owner before that scope completes.
Static types and garbage collection do not establish these lifetime guarantees.

<a id="REQ-EXEC-CANCELLATION-001"></a>

### REQ-EXEC-CANCELLATION-001 - Requests preserve direction and reason

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A selected direct cancellation link MUST propagate pre-existing and subsequent
upstream abortion with exact reason identity. Downstream cancellation MUST NOT
abort upstream or sibling sources without separately granted authority and
selected policy. Repeated requests follow a documented first-request or other
explicit arbitration rule; they MUST NOT silently overwrite established reasons.
No supplied rejection value may be rewritten merely because it resembles a
default cancellation error. Native no-reason abort behavior must be documented.

<a id="REQ-EXEC-LINKS-001"></a>

### REQ-EXEC-LINKS-001 - Linking lifetime follows represented completion

Level: MUST. Requirement status: target. Evidence status: unevidenced.

The owner of a cancellation link MUST remove its listeners on actual completion
and unwind partially installed listeners on setup failure. Abandoning a waiter
MUST NOT remove links still required by represented active work. Explicit
unlinking MUST be idempotent. Link disposal does not itself prove work
completion, and permission to unlink is not permission to release live work.

<a id="REQ-EXEC-PROPAGATION-001"></a>

### REQ-EXEC-PROPAGATION-001 - Propagation topology and shielding are explicit

Level: MUST. Requirement status: target. Evidence status: unevidenced.

An API combining cancellation inputs MUST declare its selection rule, handling
of already-aborted inputs, tie ordering, output reason, duplicate links, and
cleanup ownership. Any-source forwarding, all-source/quorum policies, fan-out,
and shielding are different policies, not synonyms. Shielding MUST explicitly
omit or defer a named propagation path; it MUST NOT imply that an
already-aborted signal became un-aborted or that every mandatory cleanup can be
cancelled.

<a id="REQ-EXEC-WAITING-001"></a>

### REQ-EXEC-WAITING-001 - Wait abandonment is separate from stopping work

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A cancellable wait MUST declare whether it only rejects that waiter or also
requests cancellation under explicit authority. Borrowed work MUST NOT be
cancelled, released, or reported completed solely because one waiter leaves.
Abandoned paths MUST continue to handle eventual represented rejections and
retain mandatory cleanup; they MUST NOT silently convert execution failure into
success. The owner-facing completion channel and failure policy must be
explicit.

### Composition policy vocabulary

The table describes independent policy dimensions, not mandatory export names.
Native result combinators remain valid for borrowed results; owning execution
combinators additionally carry explicit cancellation and completion policies.
The vocabulary does not require every provider to implement every policy.
Unsupported policies must be explicit; evidence covers the policies actually
offered, not imaginary any/all/quorum or supervision implementations.

| Composition          | Result selection                                                                 | Cancellation and completion decisions                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequence             | Later stage depends on earlier selected outcome.                                 | Forward to the active stage under declared authority; handle requests during stage transitions; do not start forbidden later work after cancellation.   |
| All results          | All fulfillments, or a selected failure under declared fail-fast/collect policy. | Declare whether failure signals owned siblings; retain all owned work and cleanup regardless of early selected failure.                                 |
| All outcomes         | One fulfillment/rejection outcome per participating result.                      | A failed candidate does not itself imply sibling cancellation; external cancellation is a separate policy.                                              |
| First settlement     | First observed fulfillment or rejection under declared tie ordering.             | Declare whether losers continue, receive requests, or are transferred; winner selection does not complete losers.                                       |
| First success        | First observed fulfillment; aggregate failure if no candidate succeeds.          | An earlier candidate failure does not imply cancelling viable candidates; declare post-success loser policy and failure ordering.                       |
| Cancellation fan-in  | A declared rule combines several request inputs.                                 | Declare any/all/quorum selection and reason arbitration; do not confuse request aggregation with result aggregation.                                    |
| Cancellation fan-out | One request reaches several designated sources.                                  | Retain independent state and authority; one recipient cannot automatically cancel siblings.                                                             |
| Shared execution     | Several subscribers observe one execution.                                       | A subscriber can abandon its wait without cancelling shared work; source cancellation requires owner policy, such as explicit last-subscriber handling. |
| Retry                | A declared policy selects successive attempts and their final outcome.           | Distinguish retained versus fresh resources and total versus per-attempt budget; old attempts must not escape their owner.                              |
| Shielded region      | Result follows the region's declared work.                                       | State which incoming requests are omitted/deferred, how requests resume, and which owner retains completion.                                            |

<a id="REQ-EXEC-COMBINATORS-001"></a>

### REQ-EXEC-COMBINATORS-001 - Combinator policy is complete before migration

Level: MUST. Requirement status: target. Evidence status: unevidenced.

An owning combinator MUST declare startup/admission policy, result selection,
request forwarding, sibling/loser policy, actual completion, cleanup failure,
empty-input behavior, synchronous setup failure, and tie/arbitration behavior.
Iteration or startup failure after partial acquisition MUST retain and unwind
already owned work. A migration MUST map useful existing graph semantics to
explicit replacements before removing forwarding or chaining mechanisms. A
native promise combinator alone is not an owning replacement.

<a id="REQ-EXEC-SHARED-001"></a>

### REQ-EXEC-SHARED-001 - Shared subscriptions do not mint source authority

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A shared-execution provider MUST separate subscriber lifetime from source
lifetime. If it offers last-subscriber cancellation, its contract MUST define
subscription admission, unsubscribe/subscribe races, late joins during shutdown,
idempotent departure, and who observes source completion and failure. A count of
current waiters alone MUST NOT justify releasing resources while work is active.

<a id="REQ-EXEC-FAILURES-001"></a>

### REQ-EXEC-FAILURES-001 - Failure channels retain primary and secondary facts

Level: MUST. Requirement status: target. Evidence status: unevidenced.

Compositions MUST preserve arbitrary rejection values, including undefined,
null, and explicit cancellation-shaped errors. They MUST define deterministic
ordering and identity preservation for aggregate failures and simultaneous
primary/cleanup failures. A result already delivered to a waiter need not be
replaced by a later loser failure; however, that failure MUST remain observable
through the documented owner-facing completion or failure channel. Identical
values MUST NOT be used to deduplicate distinct failures without an explicit
rule.

<a id="REQ-EXEC-TIMING-001"></a>

### REQ-EXEC-TIMING-001 - Constraints, scheduling, and budgets are distinct

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A fixed deadline constraint MUST identify its clock and finite absolute bound.
Intersection within one compatible clock domain MUST choose the minimum bound;
incompatible domains require rejection or an explicit conversion contract.
Relative budgets MUST state when they become absolute. Retry placement MUST
distinguish total and per-attempt budgets, and neither may widen an inherited
bound. Expired constraints MUST NOT restart with fresh time. Scheduling
ownership, reset/refresh semantics, borrowed timers, and handler completion
require separate contracts; timer cancellation is not proof that a running
handler finished.

<a id="REQ-EXEC-ADMISSION-001"></a>

### REQ-EXEC-ADMISSION-001 - Admission and release remain participant-owned

Level: MUST. Requirement status: target. Evidence status: unevidenced.

An admitted represented execution MUST retain provider-required protection
through work and mandatory cleanup. Context copies, signal links, and waiter
settlement MUST NOT forge admission or discharge completion leases. Shutdown
policy MUST state admission closure, request ordering, in-flight completion, and
release prerequisites; when work requires a shutdown request to finish, the
provider MUST NOT wait for completion before issuing that required request.

<a id="REQ-EXEC-BOUNDARIES-001"></a>

### REQ-EXEC-BOUNDARIES-001 - Providers expose mechanisms without a universal engine

Level: MUST. Requirement status: target. Evidence status: unevidenced.

Shared context contracts MUST NOT require a universal task carrier, supervisor,
effect interpreter, global registry, or common base class. Specialized providers
MUST retain their scheduling, locking, lifecycle, transaction, and release
invariants. Applications select supported composition policies through reusable
provider mechanisms rather than reimplementing private machinery. Structural
compatibility and runtime package dependency direction are separate from
specification replication; neither requires cross-repository specification
access.

<a id="REQ-EXEC-LAWS-001"></a>

### REQ-EXEC-LAWS-001 - Laws state their domain and observations

Level: MUST. Requirement status: target. Evidence status: unevidenced.

Every equivalence or algebraic law claim MUST state its inputs, authority,
ownership, clock, scheduling assumptions, and observed events. Compatible
requirement fields MUST NOT imply commuting executions. Inert, compatible scope
construction can support identity/association claims only under the stated
observation model; acquisition/release order remains observable. Fixed absolute
minimum is associative, commutative, and idempotent only in one compatible clock
domain. These laws MUST NOT be generalized to resettable timers, relative/idle
budgets, effectful clock reads, or handler-owning races.

Counterexamples include retry outside versus inside a transaction, total budget
outside retry versus fresh budgets inside attempts, and a race whose loser owns
cleanup versus one that merely borrows candidate results. Cancellation links may
be idempotent in final signal state while still differing in listener or request
traces. A law must name which of those observations it preserves.

<a id="REQ-EXEC-EVIDENCE-001"></a>

### REQ-EXEC-EVIDENCE-001 - Cases and conformance claims are bounded

Level: MUST. Requirement status: target. Evidence status: unevidenced.

Evidence MUST identify the implementation revision, selected policy, observable
trace, and requirement clauses it exercises. Deterministic gates and injected
clocks SHOULD establish race ordering rather than timing sleeps. Model fixtures,
real provider integration, declaration compatibility, and package-consumer
evidence MUST remain distinguishable. A case inventory, passing test count, or
replicated text MUST NOT be reported as full runtime conformance.

<a id="REQ-EXEC-REPLICATION-001"></a>

### REQ-EXEC-REPLICATION-001 - Semantic editions are self-contained and drift-aware

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A repository adopting this semantic edition MUST retain the full shared
definitions and clauses locally, with matching shared identifiers and edition.
Its record MUST NOT import normative meaning from another specification through
a link, include, sibling path, or instruction to consult it. Provider
obligations and evidence are local additions and MUST NOT silently weaken shared
clauses. Shared semantic text for one edition MUST remain equivalent across
replicas; material revisions require a new edition and explicit local adoption
decisions. Acceptance, evidence, and releases remain independent per repository.
Neither local validation nor package installation may require sibling checkouts
to read or validate the adopted record.

### Planned execution cases

All cases below are planned obligations, not execution receipts. Each applicable
case needs a deterministic trace, outcome assertions, and cleanup observations.

| Case                     | Required observation                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CASE-EXEC-DIRECTION      | Pre-aborted and later upstream requests preserve exact reason; downstream requests cannot abort upstream or unrelated recipients.         |
| CASE-EXEC-FANIN          | Multiple live/pre-aborted inputs, duplicate links, competing reasons, and each offered any/all/quorum policy follow declared arbitration. |
| CASE-EXEC-SHIELD         | A named upstream path is omitted/deferred while required cleanup remains owned and any resumed propagation is explicit.                   |
| CASE-EXEC-WAITER         | One waiter abandons; represented work continues, receives later required requests, and retains failure observation through completion.    |
| CASE-EXEC-SEQUENCE       | A request during stage handoff reaches the designated active stage or prevents later startup under the declared policy.                   |
| CASE-EXEC-ALL            | Selected early failure, optional sibling requests, and all owned cleanup are distinct events.                                             |
| CASE-EXEC-OUTCOMES       | One candidate failure does not imply sibling cancellation; outcome order and external request policy are explicit.                        |
| CASE-EXEC-RACE           | Winner settles before a gated loser finishes; loser cancellation policy and retained completion are independently asserted.               |
| CASE-EXEC-SUCCESS        | Early failure leaves viable candidates; success selects once; all-failed ordering and owned-loser completion remain explicit.             |
| CASE-EXEC-PARTIAL        | Startup/iteration/listener setup failure after partial acquisition unwinds only owned state and preserves primary/cleanup failures.       |
| CASE-EXEC-SUBSCRIBERS    | One subscriber leaves while another still needs shared work; final departure races with new admission under explicit owner policy.        |
| CASE-EXEC-TIME           | Same-clock minimum laws, mismatched domains, expired constraints, total/per-attempt budgets, and borrowed scheduling are distinguished.   |
| CASE-EXEC-ADMISSION      | Abandoned waits and projected contexts cannot release admission protection; shutdown requests precede waits when required for progress.   |
| CASE-EXEC-FAILURES       | Arbitrary reasons, concurrent failures, late loser failure, and asynchronous cleanup failure retain identity and declared ordering.       |
| CASE-EXEC-NONCOOPERATIVE | A requested but non-cooperative execution remains incomplete; any bounded test uses explicit gates, not a false stop guarantee.           |

<!-- shared-execution-semantics: execution-semantics-1 end -->

### Repository adoption profile

This repository owns cancellation sources, propagation mechanisms, cancellable
waiting, and explicit cancellation-facing execution composition. It consumes
structural context protocols but does not own concrete clocks, timer scheduling,
lock queues, lifecycle admission, or a universal effect runtime. All definitions
and rules required to interpret that boundary appear in this record.

<a id="REQ-ASYNC-CANCEL-SOURCES-001"></a>

### REQ-ASYNC-CANCEL-SOURCES-001 - Sources, links, and waiters have separate policies

Level: MUST. Requirement status: target. Evidence status: unevidenced.

The provider MUST expose reusable mechanisms for independent owned sources,
direct upstream forwarding, explicitly omitted forwarding, fan-out, and declared
fan-in. It MUST distinguish source disposal from work completion and wait
abandonment. A borrowed signal grants observation only. Each reusable scope
invocation MUST receive independent cancellation state unless an explicit shared
source policy is selected. No cancellation policy may be selected implicitly by
registering a listener, inspecting a signal, or constructing a result observer.
Already-aborted input handling and transition races require deterministic tests.

Direct forwarding preserves the upstream reason. An any-source fan-in selects
the first observed request; already-aborted inputs require a documented input
ordering. Other offered selection policies must define their own reason and tie
rules. Unsupported all-source or quorum policies must not be advertised as
implemented merely because they occur in the shared vocabulary.

<a id="REQ-ASYNC-CANCEL-COMPOSE-001"></a>

### REQ-ASYNC-CANCEL-COMPOSE-001 - Useful task-graph composition remains expressible

Level: MUST. Requirement status: target. Evidence status: unevidenced.

The redesigned provider MUST support explicit composition of sequential stages,
all-results, all-outcomes, first-settlement, and first-success executions
without requiring applications to reconstruct private cancellation machinery.
Owned execution inputs and borrowed result inputs MUST be distinguishable in the
API or its explicit options. Owning inputs may be deferred operation factories
or explicitly transferred handles; passing an arbitrary promise alone does not
transfer ownership. Public names and representation remain implementation-review
decisions, not a requirement for a universal task carrier.

For every owning composition, specify startup and partial-start failure,
requests from the caller, optional sibling/loser requests, selected result,
retained completion, cleanup failures, and empty input. A first-success failure
must not cancel still-viable candidates merely because one candidate failed.
All-outcomes must not cancel siblings solely because one result failed. An
all-results fail-fast policy may select an early failure while still retaining
completion of all owned inputs. A first-settlement winner does not release its
losers. Any opt-in policy allowing work to outlive a region requires an explicit
longer-lived owner and ownership transfer, not silent detachment.

<a id="REQ-ASYNC-CANCEL-STAGES-001"></a>

### REQ-ASYNC-CANCEL-STAGES-001 - Forwarding survives handoff and recovery

Level: MUST. Requirement status: target. Evidence status: unevidenced.

Sequential/chained execution MUST define how cancellation reaches the current
stage and how a request between stages prevents or reaches later startup. A
cancelled waiter MUST NOT be treated as proof that the active stage completed.
Recovery handlers may select a new result or start another explicitly owned
execution, but MUST NOT reset an already-aborted source or silently lose an
outstanding request. If a recovery region shields or replaces a propagation
path, its authority, duration, resumed propagation, and completion owner must be
explicit.

<a id="REQ-ASYNC-CANCEL-SHARED-001"></a>

### REQ-ASYNC-CANCEL-SHARED-001 - Sharing requires a source owner

Level: MUST. Requirement status: target. Evidence status: unevidenced.

A shared-work adapter MUST offer subscriber-local abandonment without cancelling
the shared execution. Any offered last-subscriber cancellation mechanism MUST
retain an owner through source completion, serialize membership/admission
transitions under a stated policy, and observe late failure. If shared-source
supervision is outside the initial implementation, it MUST be documented as
unsupported rather than inferred from a fan-in signal or a borrowed promise.

<a id="REQ-ASYNC-CANCEL-MIGRATION-001"></a>

### REQ-ASYNC-CANCEL-MIGRATION-001 - Facade removal is gated by semantic inventory

Level: MUST. Requirement status: target. Evidence status: unevidenced.

Before removing existing controller-injection, aggregate, or chaining behavior,
the migration MUST inventory actual forwarding and timing consumers and show an
explicit replacement for their useful semantics. Native promise chaining may
replace result-only behavior, but MUST NOT be claimed to replace owned execution
forwarding or completion retention without evidence. The current unverified
facade rewrite is an experiment, not an accepted API or compatibility receipt.
Runtime package contracts, emitted declarations, packed-consumer evidence, and
publication authority remain separate gates.

### Local planned cases

These cases extend the shared inventory; none is a passing execution receipt.

| Case                          | Local obligation                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| CASE-ASYNC-CANCEL-TOPOLOGY    | Direct forwarding, no forwarding, fan-out, and each offered fan-in policy preserve direction, reason, and listener lifetime.                   |
| CASE-ASYNC-CANCEL-COMBINATORS | All five required execution compositions separate result selection from requests and completion, including empty and partially started inputs. |
| CASE-ASYNC-CANCEL-HANDOFF     | Requests before, during, and after an active-stage transition follow the declared forwarding/startup policy.                                   |
| CASE-ASYNC-CANCEL-RECOVERY    | Recovery changes a selected result without implicitly clearing an established source request or dropping ownership.                            |
| CASE-ASYNC-CANCEL-SHARING     | Subscriber departure cannot cancel another subscriber's work; any offered last-subscriber policy handles concurrent admission.                 |
| CASE-ASYNC-CANCEL-MIGRATION   | Representative real consumers retain useful cancellation and completion behavior under strict packed-package and runtime checks.               |

## Consequences

### Positive

Graph composition can be discussed without conflating ancestry, cancellation,
ownership, and completion. Replicas remain independently understandable.

### Negative

Replicated text needs explicit edition review. Provider migrations require more
than renaming methods or replacing cancellable values with native promises.

### Neutral

Parent/child remains permitted as qualified shorthand. The vocabulary does not
force a scheduler, an implementation language representation, or a task tree.

## Decision Outcome

Propose the complete shared edition and the repository adoption profile above.
No implementation or full requirement satisfaction is asserted. Provider APIs
remain subject to graph-semantic inventory and evidence review.

## Related Decisions

This record is self-contained and does not incorporate another specification by
reference. It does not change any historical record's lifecycle status.

## Links

No external or cross-specification dependencies are required. Requirement and
case identifiers in this record are interpreted using the definitions above.

The local [conformance mapping](conformance.yml) indexes bounded implementation
cases and open evidence gaps. It defines no additional normative requirements.

## More Information

Shared editions coordinate vocabulary and behavior, not package version pins. A
package can adopt the same edition while implementing different explicitly
selected policies. Such differences require documentation and evidence; textual
edition equality alone is not a compatibility proof.

## Audit

### 2026-11-03

**Status:** Pending

**Findings:**

| Finding                                     | Files       | Lines                       | Assessment                                             |
| ------------------------------------------- | ----------- | --------------------------- | ------------------------------------------------------ |
| Self-contained execution semantics proposed | This record | Shared semantic section     | Runtime cases are planned, not evidenced               |
| Provider boundaries retained                | This record | Repository adoption profile | No universal engine or automatic API migration adopted |

**Summary:** Defines an explicit semantic review boundary before finalizing
cancellation and timing provider rewrites. Replica validation and runtime
conformance are separate work.

**Action Required:** Validate the record and replicas, review local adoption,
inventory actual graph compositions, and attach revision-attributed evidence
before claiming requirement satisfaction or accepting the decision.

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding                      | Files                                                                                                | Lines               | Assessment                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| Shared edition not adopted   | This record                                                                                          | Status and Decision | Withdrawn locally; no binding replication requirement        |
| Provider contracts separated | [Cancellation](../0002-cancellation-and-waiting/adr.md), [execution](../0003-owned-execution/adr.md) | Decisions           | Local decisions select provider-owned behavior independently |
| Historical evidence retained | [Conformance mapping](conformance.yml)                                                               | Verification        | Dirty candidate receipt is not evidence for a later revision |

**Summary:** The contexts project withdrew its corresponding ontology proposal.
This repository independently retains the useful cancellation and execution
decisions without presenting an ecosystem-wide semantic edition as accepted. The
historical requirements and evidence are not automatically transferred.

**Action Required:** Maintain and verify each accepted local obligation against
the applicable implementation and release revision.
