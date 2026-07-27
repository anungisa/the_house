# Volume 10 — Integrated Sequencing, Dependency Graph, and Critical-Path Model

Document ID: V10-22
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V10-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED

## 1. Purpose

This chapter defines the complete dependency graph for the affiliation vertical
and identifies the evidence-derived critical path. It is a planning model. No
schedule, window, or sequence is committed.

## 2. Relationship classification

Every dependency edge (register REG-1001, kind `DEPENDENCY_EDGE`) is classified as
one of: `HARD_PREREQUISITE`, `SOFT_PREREQUISITE`, `PARALLELIZABLE`,
`EVIDENCE_DEPENDENCY`, `POLICY_DEPENDENCY`, `PROVIDER_DEPENDENCY`,
`ENVIRONMENT_DEPENDENCY`, `MIGRATION_DEPENDENCY`, `OPERATIONAL_DEPENDENCY`, and
`RELEASE_DEPENDENCY`.

## 3. Per-work-package graph attributes

For every work package the graph records predecessors, successors, blocking
dependencies, parallel opportunities, decision dependencies, evidence
dependencies, earliest planning window, latest tolerable planning window,
schedule-confidence status, critical-path status, fallback status, and the future
gate.

## 4. Sequencing rules

- The **critical path is evidence-derived and is not visually convenient**; an
  item sits on the critical path only because a recorded dependency and its
  evidence obligation place it there.
- Target windows remain uncommitted and indicative only.
- Unresolved dependencies cannot be silently treated as complete.
- Parallelization cannot bypass institutional or technical prerequisites.

## 5. Work-state distinctions

**Prerequisite, parallel, deferred, and blocked work remain distinct.** A parallel
opportunity is not a released prerequisite; a deferred item is not a completed
item; a blocked item is not an optional item.

Sequenced work is not work started.
