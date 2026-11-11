---
title: Owned execution and composition
description:
  Explicit results, cancellation, completion, and shared execution ownership.
type: adr
category: architecture
tags: [execution, composition, ownership, completion]
status: superseded
created: 2026-11-10
updated: 2026-11-10
author: Matrix AI
project: js-async-cancellable
technologies: [TypeScript, JavaScript, Node.js]
audience: [developers, maintainers]
---

# ADR-0003: Owned execution and composition

## Status

Superseded by [ADR-0006](../0006-waiting-and-owned-completion/adr.md). The
requirements and decision below record the formerly accepted execution policies;
their historical active metadata does not make them current obligations.
ADR-0006 retains owner-observable completion and failure obligations while
making additional execution policies conditional.

## Context

### Background and Problem Statement

Selected results, cancellation requests, and owned completion are separate
events. A race winner or abandoned waiter does not finish a loser. An arbitrary
promise does not transfer ownership of the work producing it.

## Decision Drivers

### Primary Decision Drivers

- Retain represented work and required cleanup through actual completion.
- Make group, sequence, and subscriber policies explicit.

### Secondary Decision Drivers

- Preserve arbitrary failures and observable secondary failures.
- Keep native borrowed-result composition available.

## Considered Options

### Option 1: Native promise combinators alone

**Advantages:** Familiar result selection with little machinery.

**Disadvantages:** Promise inputs do not convey cancellation or ownership.

**Risk Assessment:** Early results can be mistaken for completed owned work.

### Option 2: Explicit owned execution handles

**Advantages:** Result selection and retained completion are independently
visible.

**Disadvantages:** Owners must retain and observe completion.

**Risk Assessment:** Bounded by explicit setup, failure, and cleanup policies.

## Decision

Choose option 2. An execution represents only its returned work and mandatory
cleanup. It does not automatically supervise detached effects or force
non-cooperative work to finish.

<a id="REQ-EXEC-OWNER-001"></a>

### REQ-EXEC-OWNER-001 - Owned completion is retained

Requirement status: active. Level: MUST. Evidence status: partial.

An owned execution MUST expose an owner-observable completion outcome that
includes represented work and mandatory cleanup. A cancellation request, early
selected result, or abandoned waiter MUST NOT discharge that obligation.
Arbitrary primary and cleanup failures MUST remain observable without rewriting
their identities. An early result MUST NOT hide later owned failures.

<a id="REQ-EXEC-GROUP-001"></a>

### REQ-EXEC-GROUP-001 - Group policies are explicit

Requirement status: active. Level: MUST. Evidence status: partial.

An owning group MUST accept explicitly owned operations, document startup,
selection, cancellation, empty input, and cleanup policies, and retain all
started executions after early selection or partial startup failure. First
success MUST NOT cancel viable candidates merely because another candidate
failed. All-outcomes MUST NOT cancel siblings solely because one failed. An
explicit selection policy MAY request remaining work to stop but MUST still
retain completion and unexpected later failures.

<a id="REQ-EXEC-SEQUENCE-001"></a>

### REQ-EXEC-SEQUENCE-001 - Requests survive stage handoff

Requirement status: active. Level: MUST. Evidence status: partial.

A sequence MUST preserve its effective request across stage handoff and MUST NOT
start a later stage after observing cancellation. Recovery or shielding does not
reset an aborted source; any separately provided policy must name its owner.

<a id="REQ-EXEC-SHARED-001"></a>

### REQ-EXEC-SHARED-001 - Subscribers do not own the source

Requirement status: active. Level: MUST. Evidence status: partial.

Subscribers MUST be able to abandon their own waits without automatically
cancelling the source. An optional last-subscriber policy MUST declare
admission, departure, and late-subscription behavior and retain source
completion after any cancellation request. Single-agent membership does not
imply cross-agent supervision.

## Consequences

### Positive

Applications can choose policy without reconstructing private link machinery.

### Negative

An owner may wait indefinitely for non-cooperative work or cleanup.

### Neutral

The provider does not impose a universal scheduler or own lifecycle admission.

## Decision Outcome

Provide explicitly owned execution, group, sequence, and shared-wait policies.

## Related Decisions

[Cancellation and waiting](../0002-cancellation-and-waiting/adr.md) defines
source and borrowed-wait boundaries. The withdrawn
[ontology proposal](../0001-execution-ontology-and-semantics/adr.md) remains
historical and does not impose replication obligations.

## Links

- [Execution implementation](../../src/execution.ts).
- [Execution tests](../../tests/execution.test.ts).
- [Public contracts](../../src/types.ts).

## More Information

Applications own policy composition and any explicit transfer to a longer-lived
owner. Provider behavior cannot establish that an arbitrary external effect has
finished.

## Audit

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding                | Files                                                                            | Lines        | Assessment                                             |
| ---------------------- | -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| Execution policies     | [Implementation](../../src/execution.ts), [tests](../../tests/execution.test.ts) | Whole files  | Local cases cover selected group and sequence policies |
| Completion and sharing | [Types](../../src/types.ts), [tests](../../tests/execution.test.ts)              | Whole files  | Completion is separate from subscriber waits           |
| Evidence boundary      | [Earlier mapping](../0001-execution-ontology-and-semantics/conformance.yml)      | Verification | Dirty historical receipt is not current verification   |

**Summary:** The selected local policy is binding. Candidate cases and prior
receipts do not establish every edge case, external consumer migration, or a
released package's conformance.

**Action Required:** Verify the current revision and record remaining setup,
failure, shared membership, and real-provider integration gaps.

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding                          | Files                                                                       | Lines                | Assessment                                                           |
| -------------------------------- | --------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| Removed execution implementation | [Proposed successor](../0006-waiting-and-owned-completion/adr.md)           | Context and decision | Selected owned policies are absent from the current candidate        |
| Historical evidence              | [Earlier mapping](../0001-execution-ontology-and-semantics/conformance.yml) | Records              | References removed execution tests and describes an earlier snapshot |

**Summary:** The current implementation is non-compliant with this accepted
decision, which remains binding. Its previous implementation and test links
identify the earlier snapshot and do not establish current coverage. The
proposed successor does not change the current obligation.

**Action Required:** Restore the selected policies or review an explicit
successor before claiming conformance with this decision.

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding             | Files                                                                             | Lines       | Assessment                                                          |
| ------------------- | --------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Record successor    | [ADR-0006](../0006-waiting-and-owned-completion/adr.md)                           | Decision    | Accepted successor replaces the former mandatory execution policies |
| Retained obligation | [ADR-0006](../0006-waiting-and-owned-completion/adr.md#REQ-CANCEL-COMPLETION-001) | Requirement | Owner-observable completion and failure identity remain required    |

**Summary:** The earlier implementation gap was resolved by an explicit change
of decision, not by restoring the old execution APIs. This historical record
does not establish verification of its successor.

**Action Required:** Assess current implementation and evidence against the
accepted successor and any future independently selected execution policies.
