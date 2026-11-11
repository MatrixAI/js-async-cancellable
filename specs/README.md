# Cancellation specifications

## Current decisions

- [Cancellation and waiting](0002-cancellation-and-waiting/adr.md) defines local
  signal, link, and waiter boundaries.
- [Contexts provider integration](0004-contexts-provider-integration/adr.md)
  defines shared scope composition and provider-owned lifetime boundaries; its
  original scope-entry requirement is superseded by ADR-0006.
- [Cancellation controller and directional links](0005-cancellation-controller/adr.md)
  defines the public native controller and its independently owned links.
- [Cancellable waiting and owned completion](0006-waiting-and-owned-completion/adr.md)
  defines promise waiting, owner-observable completion, and conditional
  execution policies.

Decision acceptance establishes local intent, not implementation verification,
compatibility with every consumer, or release authority. Each record's audit and
evidence status must be read separately. Contexts supplies structural protocols
and generic resource ownership; this provider owns its cancellation policies and
application code chooses composition.

## Historical decisions

- [Owned execution](0003-owned-execution/adr.md) was superseded by ADR-0006. Its
  former mandatory execution APIs and tests are absent; owner-observable
  completion and failure obligations remain under the successor.
- [Execution ontology](0001-execution-ontology-and-semantics/adr.md) was
  withdrawn without acceptance. Its shared edition and replication obligations
  are not binding here.

## Evidence boundaries

The [cancellation cases](0002-cancellation-and-waiting/cases.yml) and
[integration cases](0004-contexts-provider-integration/cases.yml) bind selected
active requirements to local tests. The controller and waiting decisions have
separate case bindings in their own bundles. These mappings do not prove
complete coverage or downstream integration. The older ontology conformance
receipt records a historical snapshot rather than current evidence.
