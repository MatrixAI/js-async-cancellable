---
title: Cancellation and waiting
description:
  Provider-owned cancellation sources, directed links, and borrowed waits.
type: adr
category: architecture
tags: [cancellation, waiting, ownership, completion]
status: accepted
created: 2026-11-10
updated: 2026-11-10
author: Matrix AI
project: js-async-cancellable
technologies: [TypeScript, JavaScript, Node.js]
audience: [developers, maintainers]
---

# ADR-0002: Cancellation and waiting

## Status

Accepted for the provider-owned boundaries below. Evidence and compatibility are
assessed independently; acceptance does not authorize a release.

## Context

### Background and Problem Statement

A signal observes a request, not ownership of the source or proof that work has
finished. A waiter may leave while represented work still uses resources. The
contexts package supplies structural signal and resource protocols, not this
provider's linking or waiting policy.

## Decision Drivers

### Primary Decision Drivers

- Preserve direction, reasons, and ownership of cancellation requests.
- Separate a waiter's lifetime from represented work and cleanup.

### Secondary Decision Drivers

- Expose reusable scopes without imposing a universal task runtime.
- Make setup and cleanup failure observable.

## Considered Options

### Option 1: Treat cancellation as completion

**Advantages:** A single caller-facing promise is easy to use.

**Disadvantages:** Rejection can precede work and cleanup.

**Risk Assessment:** Releasing live resources is unsafe.

### Option 2: Separate requests, waiting, and completion

**Advantages:** Each owner retains its own obligations.

**Disadvantages:** Callers must select and retain the appropriate boundary.

**Risk Assessment:** Bounded by explicit policies and deterministic tests.

## Decision

Choose option 2. Cancellation is cooperative; signal observation grants no
controller authority. Provider-created sources and links have owners; contexts
projection alone does not install links or create cancellation authority.

<a id="REQ-CANCEL-SOURCE-001"></a>

### REQ-CANCEL-SOURCE-001 - Independent sources and directed links

Requirement status: active. Level: MUST. Evidence status: partial.

An owned source MUST have independent state. Its selected upstream links MUST
forward pre-existing and subsequent requests with the original reason and MUST
NOT grant downstream authority over upstream or sibling sources. Any-source
fan-in MUST use first-observed arbitration, input order for already-aborted
inputs, and one link per distinct input. Omitted forwarding MUST be explicit.

<a id="REQ-CANCEL-LINK-001"></a>

### REQ-CANCEL-LINK-001 - Link ownership and cleanup

Requirement status: active. Level: MUST. Evidence status: partial.

The link owner MUST retain links through represented work and mandatory cleanup,
remove them on completion, unwind partially installed links on setup failure,
and make close idempotent. Closing a link MUST NOT itself abort work or
establish completion. Simultaneous setup and cleanup failures MUST retain both
facts.

<a id="REQ-CANCEL-WAIT-001"></a>

### REQ-CANCEL-WAIT-001 - Borrowed waits do not own work

Requirement status: active. Level: MUST. Evidence status: partial.

A cancellable borrowed wait MUST preserve the selected reason and MUST NOT
cancel, release, or claim completion of its input. After abandonment it MUST
continue to observe eventual rejection. A facade MUST select request-only or
early-rejection behavior explicitly; listener registration MUST NOT select it.
Its represented boundary does not include detached executor work.

## Consequences

### Positive

Providers can link cancellation without conflating a request with completion.

### Negative

Non-cooperative work and its links may remain live indefinitely.

### Neutral

Concrete timers, admission, and scheduling remain their respective owners'
responsibilities. Unsupported fan-in policies are not promised by vocabulary.

## Decision Outcome

Use owned directional sources and explicit, separately cancellable waits.

## Related Decisions

[Owned execution](../0003-owned-execution/adr.md) defines completion and
composition policies. The
[withdrawn ontology](../0001-execution-ontology-and-semantics/adr.md) is
historical, not a shared-edition adoption.

## Links

- [Cancellation implementation](../../src/utils.ts).
- [Waiting implementation](../../src/utils.ts).
- [Facade implementation](../../src/PromiseCancellable.ts).
- [Cancellation tests](../../tests/unit/cancellation.test.ts).
- [Waiting and facade tests](../../tests/unit/PromiseCancellable.test.ts).

## More Information

The owner decides when its represented work has finished. No signal or promise
wrapper can join arbitrary work that was not returned or explicitly owned.

## Audit

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding                 | Files                                                                              | Lines        | Assessment                                               |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------- |
| Sources and links       | [Source](../../src/utils.ts), [tests](../../tests/unit/cancellation.test.ts)       | Whole files  | Direction and cleanup have local candidate cases         |
| Waiting and facade      | [Source](../../src/utils.ts), [tests](../../tests/unit/PromiseCancellable.test.ts) | Whole files  | Borrowed waiting is distinct from represented completion |
| Historical test receipt | [Earlier mapping](../0001-execution-ontology-and-semantics/conformance.yml)        | Verification | Dirty snapshot only; no current revision verification    |

**Summary:** The decision is locally accepted. Existing cases support a bounded
review but do not establish current package, consumer, or provider conformance.

**Action Required:** Run and attribute the current test and package checks;
retain open setup, cancellation, cleanup, and integration gaps honestly.
