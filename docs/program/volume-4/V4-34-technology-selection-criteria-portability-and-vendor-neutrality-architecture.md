# V4-34 - Technology-Selection Criteria, Portability, and Vendor-Neutrality Architecture

Document ID: V4-34  
Title: Technology-Selection Criteria, Portability, and Vendor-Neutrality Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-047)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-34.1 Purpose and scope

This section is normative.

This chapter defines technology-selection **criteria** rather than choosing technologies (ARCH-V4-034,
NFR-V4-023, CTRL-V4-036, ADR-V4-037). It establishes the evaluation domains, the required capabilities,
and the portability and vendor-neutrality constraints that any later selection must satisfy. It is
**architecture definition only**: it selects no cloud service, framework, library, or vendor, and it
authorizes no procurement.

## V4-34.2 Evaluation domains

This section is normative.

The evaluation domains include: PostgreSQL access and migration tooling; evidence storage; messaging;
identity; secrets and key management; observability; analytics and search; runtime and workers;
infrastructure as code; CI/CD; and security tooling. Each domain inherits its authority boundary from
Packages 1 through 3 (for example PostgreSQL as the authoritative relational engine, DEP-V4-017, and
externalized secrets, DEP-V4-020) and is evaluated against defined criteria rather than a preferred
product.

## V4-34.3 Criteria record model

This section is normative.

Each evaluation domain is recorded, for downstream governance, with: required capability; authority
boundary; interoperability requirement; portability concern; data-export requirement; failure
behaviour; security requirement; privacy requirement; operational ownership; commercial dependency;
proof required; and decision status. Portability and a defined data-export or exit capability are
mandatory criteria for every domain (NFR-V4-023, CTRL-V4-036).

## V4-34.4 Decision-status classification

This section is normative.

Each domain's decision status is one of: `ARCHITECTURE_REQUIREMENT_DEFINED`; `OPTIONS_RESEARCH_PENDING`;
`PROOF_OF_CAPABILITY_REQUIRED`; `CONTRACT_VALIDATION_PENDING`; `SECURITY_VALIDATION_PENDING`;
`PRIVACY_VALIDATION_PENDING`; `OPERATING_MODEL_VALIDATION_PENDING`; or `MATERIAL_DECISION_PENDING`. No
domain in this package is dispositioned as selected; every domain remains at a pre-selection status,
and the material decision is reserved for a later governed gate.

## V4-34.5 Portability and vendor-neutrality

This section is normative.

Vendor neutrality is preserved by evaluating against capabilities and interfaces rather than products,
requiring a data-export and exit path for every stateful domain, and constraining vendor coupling to
adapter boundaries defined in V4-28 (CTRL-V4-036). A commercial dependency is recorded as a risk input
rather than an accepted commitment. Portability is an explicit quality requirement (NFR-V4-023), and
lock-in is treated as a governed risk (REG-404).

## V4-34.6 Non-authorizations

This section is normative.

This chapter authorizes no implementation and no procurement. It selects no Azure service, database,
message broker, identity provider, secrets manager, observability stack, search engine, runtime,
infrastructure tool, CI/CD platform, or security product; it approves no vendor; and it commits no
spend. Only criteria are defined. Every element it introduces carries `authorizes_implementation:
false`.
