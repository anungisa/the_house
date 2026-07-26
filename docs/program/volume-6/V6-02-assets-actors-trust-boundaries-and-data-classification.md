# V6-02 - Assets, Actors, Trust Boundaries, and Data Classification

Document ID: V6-02
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G1)

## V6-02.1 Purpose and scope

This section is normative.

This chapter catalogues the assets that must be protected, the actors that
interact with them, the trust boundaries between them, and the classification that
governs their sensitivity. It defines protection targets only; it authorizes no
control, access configuration, or storage design.

## V6-02.2 Protected assets

This section is normative.

The governed assets of The House, recorded in REG-601, are: governed affiliation
records (ASSET-V6-001); personal identity data (ASSET-V6-002); authentication and
secret material (ASSET-V6-003); evidence artifacts and metadata (ASSET-V6-004);
the audit journal (ASSET-V6-005); financial-status data (ASSET-V6-006); privileged
administrative capability (ASSET-V6-007); and projection and analytics data
(ASSET-V6-008).

Each asset names an authority owner and a classification. Custody and storage
design remain pending later volumes and are never conflated with ownership or
classification.

## V6-02.3 Actors

This section is normative.

The actors recorded in REG-601 span authenticated external principals
(organization representatives), staff principals (reviewers, governance
administrators, finance, support), external processors (service providers),
automated service principals, and anonymous principals. Each actor holds only the
authority named for it; anonymous and experience-layer callers hold no governed
protection authority.

## V6-02.4 Trust boundaries

This section is normative.

The trust boundaries recorded in REG-601 are: the experience-to-platform boundary
(BOUNDARY-V6-001); the platform-to-store boundary (BOUNDARY-V6-002); the
platform-to-provider boundary (BOUNDARY-V6-003); the privileged-administration
boundary (BOUNDARY-V6-004); and the tenant and jurisdiction isolation boundary
(BOUNDARY-V6-005).

Every trust boundary declares a failure posture and is named by at least one
threat or abuse scenario in V6-03. Crossing controls are recorded as pending
obligations, never as implemented controls.

## V6-02.5 Data classification

This section is normative.

Governed data is classified to drive protection obligations. The classification
categories are: public, internal, personal, restricted evidence, financial status,
privileged administrative, security audit, and analytics aggregate. Sensitivity is
recorded as low, moderate, high, or restricted. Classification inherits from and
aligns with the Volume 5 classification, minimization, and access model; it sets no
storage location, access configuration, or retention period.

## V6-02.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no storage, access configuration, identity or access
policy, or control. It defines protection targets and their classification only.
