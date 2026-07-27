# V8-12 - Affiliation Authorization-Context and Actor Contracts

Document ID: V8-12
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-12.1 Purpose

This section is normative.

This chapter defines the actor and authorization-context contracts of the affiliation domain. It names the actors who may request affiliation actions, the authorization contexts that constrain those requests, and the trust boundary an applicant crosses to reach the House. It defines who may act and under what named context; it does not define how any actor authenticates or how any authorization is enforced at runtime.

## V8-12.2 Affiliation actors

This section is normative.

The affiliation domain recognises three logical actors: the applicant acting on behalf of a member organization, the reviewer acting under delegated House authority, and House staff acting under operational authority. Each actor is a governed context, not an account. An affiliation request that cannot be resolved to one of these named actors fails closed and is not authorized.

## V8-12.3 Authorization contexts

This section is normative.

Every affiliation command and query resolves to a named authorization context that lists the context elements it requires: the acting authority, the tenant scope, the affiliation subject, and the season scope where applicable. The applicant context authorizes draft and submission actions on the applicant's own affiliation subject. The reviewer context authorizes review, return, decision, and activation actions under delegated House authority. An authorization context that names no context elements fails closed and authorizes nothing.

## V8-12.4 Reviewer scope

This section is normative.

Reviewer authority is delegated and scoped. A reviewer context authorizes decision actions only within the tenant and season for which the reviewer holds delegated scope. The affiliation domain treats reviewer scope as a required context element on every decision, return, and activation command. A decision requested without a resolved reviewer scope fails closed and does not mutate governed state.

## V8-12.5 Applicant trust boundary

This section is normative.

The applicant crosses a trust boundary to reach the House affiliation domain. That boundary is fail-closed: an applicant request that cannot be attributed to a known applicant context, tenant, and affiliation subject is refused before any affiliation contract is evaluated. The boundary contract defines the posture only; it defines no authentication mechanism, token format, or session model.

## V8-12.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no authentication mechanism, credential, token, session, directory, or enforcement engine, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
