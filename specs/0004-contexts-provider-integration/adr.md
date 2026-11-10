---
title: Contexts provider integration
description:
  Cancellation provider composition, represented lifetimes, and protocol
  boundaries.
type: adr
category: architecture
tags: [contexts, provider, cancellation, composition, ownership]
status: accepted
created: 2026-11-10
updated: 2026-11-10
author: Matrix AI
project: js-async-cancellable
technologies: [TypeScript, JavaScript, Node.js]
audience: [developers, maintainers]
---

# ADR-0004: Contexts provider integration

## Status

Accepted for the cancellation provider's integration boundaries. This decision
does not establish every consumer's behavior, provide release authorization, or
adopt another provider's policies. Requirements and evidence are separate.
[ADR-0006](../0006-waiting-and-owned-completion/adr.md) supersedes only
REQ-CANCEL-CONTEXT-SCOPE-001; the other requirements remain active.

## Context

### Background and Problem Statement

Contexts supplies structural operation, scope, signal, and ownership contracts.
This package is a concrete provider: it must offer a scope applications can
compose directly, while remaining responsible for the sources and links it
acquires. Passing a context, receiving a signal, or returning an iterator does
not establish ownership or lifecycle admission.

## Decision Drivers

### Primary Decision Drivers

- Preserve provider-owned cancellation and represented completion.
- Preserve outstanding structural requirements and explicit scope ordering.

### Secondary Decision Drivers

- Support ordinary functions and contexts-owned adapters without a new runtime.
- State iterator, timer, lifecycle, and ambient boundaries honestly.

## Considered Options

### Option 1: Put all provider integration in applications

**Advantages:** The provider surface remains minimal.

**Disadvantages:** Applications repeatedly recreate link and cleanup policy.

**Risk Assessment:** Duplicated adapters can unlink live represented work.

### Option 2: Export a reusable provider scope over shared protocols

**Advantages:** Applications compose the provider directly and select order.

**Disadvantages:** Provider semantics and compatibility must be documented.

**Risk Assessment:** Bounded through local and packed-consumer tests.

## Decision

Choose option 2. This package imports the shared public contexts protocol and
owns the actual signal linking and cleanup. Applications select composition
order; the provider does not infer a universal execution graph or a lifecycle
admission lease from a context value.

<a id="REQ-CANCEL-CONTEXT-SCOPE-001"></a>

### REQ-CANCEL-CONTEXT-SCOPE-001 - Reusable structural scope

Requirement status: active. Level: MUST. Evidence status: partial.

Historical status note: this requirement is superseded by
[REQ-CANCEL-SCOPE-ENTRY-001](../0006-waiting-and-owned-completion/adr.md#REQ-CANCEL-SCOPE-ENTRY-001).
The metadata and clause below record the earlier obligation.

The cancellation scope MUST be constructible without entering work or acquiring
a source. Each invocation MUST acquire its own source and provide its signal
while preserving compatible unrelated context fields and outstanding operation
requirements. It MUST NOT claim to provide a more refined signal than it owns.
Its pre-aborted entry policy MUST be explicit: the scope invokes its body with
the aborted signal; the owned execution entry separately rejects before body
entry. Source cleanup MUST follow represented body completion.

<a id="REQ-CANCEL-CONTEXT-ORDER-001"></a>

### REQ-CANCEL-CONTEXT-ORDER-001 - Order and release remain explicit

Requirement status: active. Level: MUST. Evidence status: partial.

Composition MUST preserve the selected scope nesting and MUST NOT assume scopes
commute. A cancellation request or a separate abandoned wait MUST NOT release
the source or another provider's still-used resource. Each owner retains its own
cleanup and failure policy; the cancellation scope MUST preserve both body and
unlink failure when both occur. Detached, unrepresented effects are outside this
guarantee.

<a id="REQ-CANCEL-CONTEXT-ITERATION-001"></a>

### REQ-CANCEL-CONTEXT-ITERATION-001 - Consumption and generator ownership

Requirement status: active. Level: MUST. Evidence status: partial.

Scoping creation of an iterator or generator MUST NOT be described as retaining
the cancellation source through later caller-driven consumption. To retain the
source, the owner MUST represent consumption within the scope or explicitly own
the source through the generator's terminal completion and cleanup. An abandoned
suspended generator may retain ownership indefinitely; cleanup that yields may
require further caller advancement. A borrowed iterator is not implicitly owned
or cancelled. This decision does not require a separate generator convenience
API.

<a id="REQ-CANCEL-CONTEXT-BOUNDARY-001"></a>

### REQ-CANCEL-CONTEXT-BOUNDARY-001 - Other provider authorities remain separate

Requirement status: active. Level: MUST. Evidence status: partial.

The provider MUST NOT treat a projected signal, ambient value, diagnostic ID, or
waiting result as lifecycle admission, authority over another source, timer
scheduling, or completion of a timer handler. Function and method facades, when
used, MUST delegate to the selected scope rather than create another
cancellation owner. Optional ambient transport and inspection MUST NOT be
required to use the provider. Clock comparison, timer reset, shutdown, and
admission remain with their respective owners.

## Consequences

### Positive

The provider participates in shared composition without reimplementing unrelated
provider engines.

### Negative

The application must retain represented completion and explicitly close owned
caller-driven generators.

### Neutral

Structural type compatibility alone does not prove behavior or release safety.

## Decision Outcome

Expose provider-owned cancellation through reusable shared protocols and keep
composition and independent provider policies explicit.

## Related Decisions

- [Cancellation and waiting](../0002-cancellation-and-waiting/adr.md).
- [Owned execution](../0003-owned-execution/adr.md).

## Links

- [Cancellation scope](../../src/utils.ts).
- [Provider integration cases](../../tests/contexts.test.ts).
- [Packed declaration consumer](../../tests/fixtures/package/types.ts).

## More Information

The local tests exercise the installed contexts producer and local fixtures.
They are not proof of lock, timer, lifecycle, or application integrations.

## Audit

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding                 | Files                                                              | Lines       | Assessment                                              |
| ----------------------- | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------- |
| Structural provider     | [Scope](../../src/utils.ts), [cases](../../tests/contexts.test.ts) | Whole files | Scope and local bracket integration exercised           |
| Owned generator example | [Cases](../../tests/contexts.test.ts)                              | Generator   | Explicit generator owner retains links through cleanup  |
| Packed types            | [Consumer](../../tests/fixtures/package/types.ts)                  | Whole file  | Local declaration checks are bounded to selected inputs |

**Summary:** The provider integration policy is accepted independently. Native
candidate checks do not establish real lifecycle, timer, lock, browser, or
released-package integration.

**Action Required:** Retain revision-attributed runtime, type, archive, and
hermetic verification; add concrete provider evidence only when available.

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding              | Files                                                    | Lines       | Assessment                                                                           |
| -------------------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Separate owned entry | [Scope requirement](adr.md#REQ-CANCEL-CONTEXT-SCOPE-001) | Requirement | The separately specified owned execution entry is absent                             |
| Historical fixture   | [Type cases](../../tests/cancellation.test-d.ts)         | Whole file  | The earlier packed fixture was removed; current type cases have a different boundary |

**Summary:** The current candidate is non-compliant with the missing
execution-entry obligation. Its scope cases support selected structural and
cleanup behavior. The earlier fixture link is historical and does not establish
current package-consumer evidence. The proposed successor has not changed this
accepted requirement.

**Action Required:** Restore the entry or review a scoped successor; retain
current runtime and type evidence without claiming downstream integration.

### 2026-11-10

**Status:** Partial

**Findings:**

| Finding                        | Files                                                                              | Lines       | Assessment                                                |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------- |
| Scope requirement              | [ADR-0006](../0006-waiting-and-owned-completion/adr.md#REQ-CANCEL-SCOPE-ENTRY-001) | Requirement | Accepted successor replaces the separate-entry obligation |
| Other integration requirements | [Cases](cases.yml)                                                                 | All cases   | The remaining requirements retain bounded local evidence  |

**Summary:** The previously missing execution-entry obligation is superseded at
the named requirement only. Other integration requirements remain active, and
actual timer and lifecycle integrations remain unverified.

**Action Required:** Maintain current scope and integration cases and verify
downstream consumers in their own migrations.
