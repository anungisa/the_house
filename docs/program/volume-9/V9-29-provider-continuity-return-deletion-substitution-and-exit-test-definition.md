# Volume 9 — Provider Continuity, Return, Deletion, Substitution, and Exit Test Definition

Document ID: V9-29
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G3)

## Purpose

This chapter defines the provider-assurance obligations for continuity, data return,
deletion, substitution, and exit across external providers. It defines what must be
tested, not how any test is written or run, and authorizes no execution, provider
selection, contract, environment, or tool.

## Provider certification is not end-to-end assurance

A provider certification or attestation is held strictly distinct from end-to-end
assurance of the governed obligation as composed in The House. A provider assurance
covers the provider's own boundary; it never by itself establishes that the governed
end-to-end obligation holds across the integration. A provider certification treated
as end-to-end proof is detected and rejected.

## Continuity, substitution, and exit

Provider continuity obligations span degraded provider operation, provider outage,
data return, deletion confirmation, provider substitution, and exit. A substitution
preserves governed invariants and continuity of the authoritative record, and an exit
includes verified data return and verified deletion. Data return is held distinct
from deletion: a return does not imply that the provider has deleted its copy, and a
deletion is confirmed rather than assumed. A substitution or exit that loses governed
state, or an unverified deletion, is detected and fails closed.

## Boundary

No provider obligation in this chapter selects a provider, forms a contract, or
asserts a continuity, substitution, or exit result. Each is a documentary obligation
only, and the end-to-end demonstration that a future authorization would require is
not created, provisioned, or executed by this package.
