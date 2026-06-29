# Curling Canada — Reference Profile (documentation only)

This document describes how Curling Canada concepts map onto the **NSO-generic** platform
core of The House v2. It is **documentation only** — no profile runtime logic exists yet.

## Principle

The House v2 platform core is sport-agnostic. **Curling Canada is the first reference
profile**, used to validate the generic model and seeded as the original domain source (via
the legacy Base44 app). Curling-specific terminology is an **alias layer** on top of the
generic core, never a replacement for it.

Curling-specific terms (PTSO, MA, club, curler, curling centre, bonspiel, championship,
league) are permitted only in:

- documentation (such as this file),
- the Curling Canada reference profile,
- future sport-profile configuration,
- clearly-marked curling test fixtures.

They must **not** appear in the Governance Kernel, tenancy, identity, audit, evidence,
outbox, shared platform types, core database table names, or generic API contracts.

## Conceptual mapping

| Curling Canada concept              | Generic platform concept            |
| ----------------------------------- | ----------------------------------- |
| Curling Canada (national body)      | national organization               |
| PTSO / MA (provincial/territorial)  | regional governing body             |
| Club                                | local organization                  |
| Curler / member                     | participant                         |
| Curling centre                      | facility                            |
| League                              | program / competition structure     |
| Bonspiel / championship             | event                               |

## Generic scope fields

Across the platform core, scope is expressed generically:

- `tenantId`
- `organizationId`
- `organizationUnitId`
- `nationalOrganizationId`
- `regionalOrganizationId`
- `localOrganizationId`
- `scopeType`
- `scopeId`

For Curling Canada, a regional governing body (PTSO/MA) maps to
`scopeType = 'regional_organization'`, a club maps to `scopeType = 'local_organization'`,
and so on. No `ptsoId` / `clubId` / `curlerId` fields exist in the core.

## Affiliation relevance

The first Governance Kernel vertical slice — `AffiliationApplication` — uses Curling Canada
as its illustrative example (a club affiliating with a PTSO/MA under Curling Canada). The
kernel and its FSM remain generic enough for any Canadian NSO; the curling framing is
profile/example-level only.

The legacy **Goodwill Baseline** doctrine (historical affiliation is inherited; future
affiliation is governed) is a governance decision for Curling Canada that informs how
existing local organizations are baselined — it is not platform-core runtime behaviour.

## Out of scope

- Profile loading / adapter implementation
- Mapping enforcement at runtime
- Any sport-specific behaviour in core layers

These are addressed only after the Governance Kernel vertical slice, as a profile layer on
top of the generic core.
