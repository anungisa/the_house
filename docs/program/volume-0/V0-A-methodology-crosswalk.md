# Annex A - Methodology Crosswalk

Document ID: V0-A-METHODOLOGY-CROSSWALK
Status: RATIFIED
Version: 1.0.0
Associated Gate: G0

This annex is explanatory except where it references normative controls elsewhere.

## Purpose

Show how the Volume 0 corpus implements and modernizes the ingested
application-development methodology, which requires connecting business goals to
requirements, design, stakeholders, implementation, and testing, and treats
stakeholder approval as a living governance checkpoint.

## Crosswalk

| Methodology requirement | Volume 0 implementation |
| --- | --- |
| Link development to business goals | Outcomes (V0-03) and traceability doctrine (V0-10); PR-001 |
| Involve the right stakeholders | Stakeholder authority and engagement model (V0-08); REG-001 |
| Define business, functional, and technical requirements | Later-volume requirement hierarchy; identifier scheme in V0-10 |
| Choose design approach intentionally | Delivery and architecture doctrines (V0-09); ADR process |
| Map use cases, applications, and integrations | Volumes 2 to 8 (future); scope layering in V0-04 |
| Design testing from use cases and requirements | Concurrent testing (PR-008); Volume 9 (future) |
| Maintain stakeholder communication and approval | Gate and approval system (V0-07, V0-12); REG-006 |
| Manage risks and dependencies | RAID and exception registers (V0-11); REG-003, REG-007 |

## Modernization note

The ingested sample consolidated requirements, responsibilities, design,
development controls, and QA into a single maintained project record. Volume 0
modernizes that function by making the governance:

- source-controlled (Markdown and YAML as source of truth);
- traceable (stable identifiers and a required traceability chain);
- testable (concurrent testing and gate evidence);
- enforceable (delivery gates and, in Package 3, machine checks).
