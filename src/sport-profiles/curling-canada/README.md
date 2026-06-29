# Sport Profile — Curling Canada (reference profile placeholder)

**Scaffold status:** placeholder only. No profile runtime logic is implemented in this
pass.

## Why this exists

The House v2 is an **NSO-generic** national sport platform core. Curling Canada is the
**first reference profile** and the original domain source (via the legacy Base44 app) —
it is **not** the platform architecture and its terminology must not leak into core layers
(Governance Kernel, tenancy, identity, audit, evidence, outbox, shared types, core table
names, generic API contracts).

Curling-specific terms are **aliases / profile-level concepts** that map onto generic
platform concepts. They may appear only in documentation, this reference profile, future
sport-profile configuration, and clearly-marked curling test fixtures.

## Intended conceptual mapping (documentation only)

| Curling Canada term            | Generic platform concept            |
| ------------------------------ | ----------------------------------- |
| Curling Canada (national body) | national organization               |
| PTSO / MA                      | regional governing body             |
| Club                           | local organization                  |
| Curler / member                | participant                         |
| Curling centre                 | facility                            |
| Bonspiel / championship        | event                               |
| League                         | program / competition structure     |

## Out of scope for this pass

- Actual profile loading / adapter logic
- Mapping enforcement
- Any sport-specific runtime behaviour

These arrive only after the Governance Kernel vertical slice, and only as a profile layer
on top of the generic core.
