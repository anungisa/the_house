# V6-42 - Authority, Asset, Boundary, Threat, Right, Obligation, and Control Catalogue

Document ID: V6-42
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G5)

## V6-42.1 Purpose and scope

This section is normative.

This chapter is the final cross-catalogue for Volume 6. It consolidates, by
reference to the frozen Packages 1 through 4, the catalogued authorities, assets,
trust boundaries, threats, rights, obligations, and controls, and it records the
governed relationships between them. It is a consolidation and introduces no new
catalogue element. It authorizes no implementation.

## V6-42.2 Catalogue-element record

This section is normative.

For every catalogue element consolidated here, the cross-catalogue records the
following attributes by reference to the frozen source: the identifier; the record
kind; the purpose; the protected asset or right; the authority; the owner; the
custodian or operator status; the trust boundary; the threat or obligation
addressed; the control relationship; the classification; any privacy constraint;
any accessibility dependency; any bilingual dependency; the evidence requirement;
any exception authority; the future validation; and the implementation status. The
deterministic final-closure tooling (V6-51) projects this record set from
registers REG-601 and REG-602 and reports any element missing a required attribute
as a blocking error.

## V6-42.3 Catalogued authorities and assets

This section is normative.

The cross-catalogue consolidates the catalogued assets (ASSET-V6-001 through
ASSET-V6-026), rights (RIGHT-V6-001 through RIGHT-V6-008), and trust boundaries
(BOUNDARY-V6-001 through BOUNDARY-V6-007) established across Packages 1 through 4.
Each asset carries an authority owner and a classification; each right carries the
party it protects; and each boundary carries the threats or abuse cases that name
it. No asset, right, or boundary is added, removed, or reclassified here.

## V6-42.4 Authority separations

This section is normative.

The cross-catalogue demonstrates, and does not weaken, the following governed
authority separations established in the frozen packages:

- institutional authority over governed records is distinct from technical custody
  of the systems that hold them;
- a support or assistance role is distinct from a decision authority;
- financial authority is distinct from affiliation authority;
- incident authority is distinct from business-decision authority;
- monitoring and detection authority is distinct from content authority;
- an external provider acquires no Curling Canada or House authority; and
- assurance evidence is distinct from operational authority.

Each separation is recorded as a decision in REG-603 and is preserved without
modification.

## V6-42.5 Threat, right, and control relationships

This section is normative.

Every catalogued threat and abuse case names an affected asset or right and a
trust boundary, and defines preventive, detective, and corrective objectives.
Every catalogued obligation references a control objective and the asset or right
it protects. Every catalogued control objective carries an owner, required
evidence, and a future blocking gate. The cross-catalogue records these
relationships by reference and adds no new relationship.

## V6-42.6 Classification, privacy, accessibility, and bilingual constraints

This section is normative.

Each catalogue element carries the classification, privacy constraint,
accessibility dependency, and bilingual dependency recorded in its frozen source.
The cross-catalogue records these constraints by reference. It sets no retention
period, reaches no privacy or legal conclusion, makes no accessibility-conformance
claim, and makes no bilingual-validation claim.

## V6-42.7 Exception authority and future validation

This section is normative.

Where a catalogue element records an exception authority, that authority is
consolidated by reference and is unchanged. Every element carries a future
validation destination — a future blocking gate, a downstream volume, or an
independent-assurance dependency — and remains not-implemented or not-proven.

## V6-42.8 Explicit non-authorizations

This section is normative.

This chapter adds no catalogue element; implements no control; creates no
executable access rule, isolation rule, policy, monitoring rule, or workflow;
reclassifies no asset or right; reaches no legal conclusion; sets no retention
schedule; makes no conformance, compliance, accessibility, bilingual-validation,
operational-readiness, or assurance claim; selects no provider, vendor, or
technology; and authorizes no procurement or implementation.
