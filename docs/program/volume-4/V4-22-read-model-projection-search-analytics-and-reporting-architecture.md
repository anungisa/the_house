# V4-22 - Read-Model, Projection, Search, Analytics, and Reporting Architecture

Document ID: V4-22  
Title: Read-Model, Projection, Search, Analytics, and Reporting Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-031)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-22.1 Purpose and scope

This section is normative.

This chapter defines the architecture for non-authoritative views: read models, projections, search
indexes, analytics exports, and reporting. It defines, for each projection family, its authoritative
source, owner, consumers, refresh mechanism, consistency expectation, failure behaviour, rebuild
source, replay posture, security scope, privacy classification, staleness representation, and
operational owner. It authors no executable query, index, or report definition.

## V4-22.2 Projection families

This section is normative.

The governed projection families include club affiliation status, required actions, reviewer queues,
operational aging, financial reconciliation status, activation status, support context, management
reporting, audit views, analytics exports, and Button-facing views (DATA-V4-018). Each projection is
served through a projection and reporting boundary (SVC-V4-024) and is derived from authoritative
House state or retained governed events.

## V4-22.3 Non-authority and rebuildability

This section is normative.

Projections are **non-authoritative and rebuildable** (ARCH-V4-022, ADR-V4-022). A projection or
search index never becomes an independent record of authority; it is reconstructable from
authoritative facts or retained events. Projection failure does not change governed state
(CTRL-V4-023): a failed or lagging projection degrades only the derived view, never the authoritative
record.

## V4-22.4 Staleness, consistency, and failure

This section is normative.

Each projection declares its consistency expectation and represents staleness so that a stale
projection is **detectable** rather than silently trusted (CTRL-V4-023). Failure behaviour and replay
posture are defined per projection: on failure the projection is marked stale or unavailable and is
rebuilt from its authoritative source. Search indexes follow the same rule and are never treated as
authoritative.

## V4-22.5 Analytics, reporting, and privacy scope

This section is normative.

Analytics access remains purpose- and jurisdiction-scoped, and reporting definitions preserve the
semantics established by Volumes 2 and 3. Each projection carries a security scope and privacy
classification; analytics exports are bounded and auditable and are subject to the privacy
minimization boundary defined in V4-24. This chapter authorizes no implementation and authors no
executable query, index, materialized view, or report; every element it introduces carries
`authorizes_implementation: false`.
