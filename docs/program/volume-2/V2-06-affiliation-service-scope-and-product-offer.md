# V2-06 - Affiliation Service Scope and Product Offer

Document ID: V2-06  
Title: Affiliation Service Scope and Product Offer  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-010)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-06.1 Purpose

This section is normative.

This chapter defines the scope of the affiliation service as a product and states what
the product offers, for whom, and under what boundaries. It builds on the Package 1
product statement (V2-01) and the qualified first-release boundary inherited from V1-24.
It defines the affiliation product offer only. It does not define detailed operating
rules, technical architecture, delivery sequencing, or the master development plan.

## V2-06.2 Service purpose

This section is normative.

The affiliation service is the governed capability by which a curling club becomes and
remains recognized and affiliated with the National Sport Organization for a defined
season. Its purpose is to establish, for every club and every season, a single
authoritative, evidenced, and auditable answer to the questions: is this club
recognized; is it affiliated for this season; what is its current lifecycle state; and
what evidence and decisions support that state.

The service exists to make affiliation a governed, repeatable, and transparent process
rather than an ad hoc administrative exchange.

## V2-06.3 Users and beneficiaries

This section is normative.

The affiliation service serves the stakeholders recorded in REG-202, including:

- the National Sport Organization as system-of-record owner and policy authority
  (STK-V2-001);
- provincial and territorial member organizations with jurisdictional responsibility
  (STK-V2-002);
- affiliated clubs as the governed entities (STK-V2-003);
- club administrators who prepare and submit applications (STK-V2-004);
- participants and members whose context depends on affiliation status (STK-V2-005);
- reviewers and national administrators who evaluate and decide (STK-V2-006, STK-V2-009);
- support agents who assist applicants and reviewers (STK-V2-010); and
- external systems of authority that reconcile with, but do not own, the record
  (STK-V2-008).

## V2-06.4 Entry conditions

This section is normative.

A club engages the affiliation service when one of the following holds: an existing
recognized club opens seasonal affiliation for a new season; a previously affiliated
club renews after a lapse and may require remediation; or a new organization seeks
recognition and first-time affiliation. Entry does not presume eligibility; eligibility
is determined within the service through the governed pathway (V2-07).

## V2-06.5 Outcomes offered

This section is normative.

The product offer delivers the outcomes recorded in REG-201, including the Package 1
outcomes (OUT-V2-001 through OUT-V2-007) and the Package 2 outcomes: governed
recognition and affiliation through matched pathways (OUT-V2-008); defined affiliation
work for reviewers and administrators (OUT-V2-009); timely, bilingual, accessible
status and required-action communication (OUT-V2-010); defined or explicitly pending
product measures (OUT-V2-011); and governed handling of non-standard club scenarios
(OUT-V2-012).

## V2-06.6 Included capabilities

This section is normative.

The product offer includes, at a product level: organization recognition; representative
authority confirmation; jurisdiction resolution; seasonal affiliation opening; pathway
determination; versioned requirement application; evidence collection and binding;
completeness checking; submission; reviewer routing and queues; review, return, and
resubmission; decision recording; activation exactly once per season; status and
required-action exposure; notification; administrative correction; and audit and
operational reporting. These capabilities are catalogued as controlled requirements in
V2-09 and REG-203.

## V2-06.7 Exclusions and non-goals

This section is normative.

The affiliation service is explicitly distinguished from, and does not itself provide:

- **membership registration** of individual participants (a separate governed domain);
- **accreditation and certification** of officials or coaches;
- **competition and event entry**;
- **payment processing and accounting** as a system of record for financial transactions
  (the service reconciles a fee-paid signal at a boundary but is not an accounting
  system);
- **learning management**;
- **general-purpose compliance case management** beyond affiliation; and
- any experience-layer product ownership of governed lifecycle state.

These exclusions are product-scope boundaries, not statements about future volumes.

## V2-06.8 House and Button responsibilities

This section is normative.

The House owns affiliation lifecycle state, authority, evidence, decisions, audit, and
the authoritative record. The Button provides the guided applicant and status
experience and surfaces required actions. The Button never independently owns or mutates
governed lifecycle state. This boundary is inherited from V2-03 and applies to every
capability in this package.

## V2-06.9 External dependencies

This section is normative.

The service depends on external systems of authority for reference and reconciliation
data (for example prior registration or fee signals) as recorded in OUT-V2-007 and
STK-V2-008. These dependencies are integration boundaries. The specific systems,
contracts, and data-sharing terms remain subject to operational and stakeholder
validation and are recorded as unresolved where not yet confirmed.

## V2-06.10 Value across the ecosystem

This section is normative.

The product offers national value (a single authoritative affiliation record and
consistent governance), member-organization value (jurisdictional visibility and
delegated oversight without divergent records), club value (a guided, predictable
affiliation experience), and support value (defined communication and assisted
resolution). These value statements are product intents; their measures are defined or
recorded as pending in V2-11.

## V2-06.11 Authorization posture

This section is normative.

This chapter defines product scope only. It authorizes no implementation, no
procurement, no migration, and no master development plan. Executive organizational
acceptance remains pending at the material-commitment gate.
