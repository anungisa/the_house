# V5-05 - Tenant, Jurisdiction, Season, and Information-Scope Model

Document ID: V5-05
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-05.1 Purpose

This section is normative.

This chapter defines the conceptual scope model that bounds access to governed
information: tenancy, jurisdiction, season, and information scope. It is consistent
with the inherited tenant-isolation and fail-closed posture of The House v2 and
authorizes no implementation.

## V5-05.2 Scope dimensions

This section is normative.

Governed information is bounded by four conceptual scope dimensions:

- Tenant scope — the governed isolation boundary that owns tenant-scoped records.
- Jurisdiction scope (DOMAIN-V5-004) — the national and PTSO authority hierarchy
  that bounds recognition and governance.
- Season scope (DOMAIN-V5-005) — the temporal envelope for affiliation records.
- Information scope — the domain and case boundaries recorded per information
  domain in REG-501.

## V5-05.3 Fail-closed cross-scope rule

This section is normative.

Access that spans a scope boundary fails closed unless an explicit governed
authority permits it. Missing or ambiguous scope context is treated as denial, not
as an open grant. This mirrors the inherited tenant-context and RLS discipline:
scope context must be established before scoped information is accessed, and absence
of scope context denies access.

## V5-05.4 Jurisdictional variants

This section is normative.

Jurisdictions may carry governed variants in recognition, requirement, and season
rules. Variants are represented explicitly rather than flattened. Cross-jurisdiction
access is a governed exception, never a default. Jurisdiction-alignment quality
(QUALITY-V5-009) detects cross-jurisdiction mismatches; jurisdictional-variant
validation is tracked by TEST-V5-005, and cross-jurisdiction leakage risk by
RISK-V5-002.

## V5-05.5 Scope and identity interaction

This section is normative.

Scope bounds what a party may access; it does not widen authority. A representative
or support relationship is always evaluated within scope, and support context never
broadens governed decision authority. Scope and authority are separate governed
facts.
