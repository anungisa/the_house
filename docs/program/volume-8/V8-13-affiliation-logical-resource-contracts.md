# V8-13 - Affiliation Logical Resource Contracts

Document ID: V8-13
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-13.1 Purpose

This section is normative.

This chapter defines the logical resource contracts of the affiliation domain. A logical resource is a governed definition of a durable affiliation subject: its owning authority, its authoritative source, and its purpose. It is not a wire schema, table, or field list. This chapter names the affiliation resources; it defines no serialization, storage, or transport for any of them.

## V8-13.2 Resource catalogue

This section is normative.

The affiliation domain defines four logical resources: the affiliation application, the affiliation evidence set, the affiliation decision, and the affiliation finance-and-reconciliation record. Each is a distinct governed definition with its own authority, source, and purpose. No affiliation resource exists outside this catalogue, and each is recorded in the contract-surface register as a logical resource.

## V8-13.3 Resource authority and source

This section is normative.

Every logical affiliation resource resolves to the House as institutional authority and to the House affiliation lifecycle state as authoritative source. A logical resource that cannot name a single owning authority and a single authoritative source fails closed and is not defined. No resource draws its authoritative state from an experience layer, a staff role, or an external provider.

## V8-13.4 Resource purpose and boundaries

This section is normative.

Each logical resource states its purpose and its boundary. The affiliation application holds the requested affiliation and its declared fields. The affiliation evidence set holds attestations and required documents. The affiliation decision holds the reviewed disposition. The finance-and-reconciliation record holds fee obligation and settlement state. A resource may reference another resource only by its governed identity; it does not embed or own another resource's authoritative state.

## V8-13.5 Resource lifecycle alignment

This section is normative.

Logical resources are shaped by, but do not own, affiliation lifecycle state. Lifecycle state is governed by the House affiliation state machine and is changed only through governed transitions. A logical resource contract records which lifecycle states a resource is defined for; it grants no authority to mutate lifecycle state directly and defines no transition of its own.

## V8-13.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no schema, table, column, serialization, storage engine, or transport for any resource, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
