# V0-06 - Product, Repository, and Authority Doctrine

Document ID: V0-06  
Status: DRAFT  
Version: 0.1.0

## Purpose

Define authority boundaries among The House, The Button, Base44, and external systems.

## Constitutional draft controls

- The House: intended governed platform and system-of-record foundation. It is
  treated as target-platform current implementation truth (a production-candidate
  implementation baseline), NOT as established production truth. Prior technical
  assessment identified material authorization, composition, evidence-binding,
  workflow, and operational gaps that MUST be closed before production-truth status
  is claimed.
- The Button: intended client-facing operating experience. It is not yet an
  implemented authority and MUST NOT act as an independent authority layer.
- Base44: current reference-case evidence and product-discovery intelligence. It is
  not authoritative for security, authorization, state transitions, data integrity,
  production architecture, final business rules, test completeness, or
  system-of-record decisions.
- External systems: classified as authoritative provider, execution plane,
  synchronization partner, projection source, reporting source, or temporary
  transition system (recorded in REG-005).

## Authority conflict rule (proposed)

1. Ratified policy and executive decisions govern.
2. Approved program and domain decisions govern.
3. Approved target designs govern implementation direction.
4. The House provides current target-platform implementation truth
   (production-candidate), not final production authority.
5. Base44 provides discovery and reference-case evidence only.
6. Neither repository overrides ratified policy or approved target design.

Ratification target: Package 2.
