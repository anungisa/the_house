# Volume 9 — Security, Identity, Authorization, Isolation, and Privilege Test Definition

Document ID: V9-22
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G3)

## Purpose

This chapter defines the security assurance obligations for identity, authorization,
isolation, and privileged action. It defines what must be tested, not how any test
is written or run, and authorizes no execution, environment, credential, or tool.

## Authentication is distinct from authorization

Authentication establishes who an actor is; authorization establishes whether that
actor holds resolved authority to act on a specific resource. The two are held
strictly distinct. A valid authentication never implies authorization. Every
security obligation evaluates resource-aware authority independently of identity
proof, and each authorization determination is judged against the governed
authorization oracle rather than against the presence of a session.

## Resource-aware authorization and isolation

Authorization is evaluated across organization, jurisdiction, resource, lifecycle
state, delegation, and assignment. Organization and jurisdiction isolation are
non-negotiable: a governed read or write must never expose or mutate data belonging
to another tenant or jurisdiction. Delegation and assignment confer only the
authority they name and never more.

## Service identity and fail-closed behaviour

A service identity that acts without a resolved authorization policy or authority
context is denied and fails closed rather than proceeding on assumption. Missing or
unavailable policy, missing authority context, and unresolved delegation each
resolve to a fail-closed denial. Every governed success path carries an explicit
denial counterpart, so that the definition of a permitted action is always paired
with the definition of the refusals that protect it.

## Privileged action

Privileged and administrative actions carry heightened authorization, isolation, and
audit obligations. A privileged action without resolved elevated authority is denied
and fails closed. No security obligation in this chapter asserts that any control is
implemented, operating, or effective; each is a documentary obligation only,
awaiting a forward execution gate.
