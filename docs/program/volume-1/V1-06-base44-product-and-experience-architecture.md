# V1-06 - Base44 Product and Experience Architecture

Document ID: V1-06  
Title: Base44 Product and Experience Architecture  
Status: RATIFIED  
Version: 1.1.0  
Ratification: Package 2 baseline, amended v1.1.0; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-B, REG-108 APP-V1-009; amendment REG-107 DEC-V1-011)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G2)  
Supersedes: None  
Review Cycle: Frozen at Package 2 closure; changes require the recorded amendment process (amended to v1.1.0 under that process, DEC-V1-011)  
Repository Path: docs/program/volume-1/

## V1-06.0 Amendment record (v1.1.0) - source-baseline correction

This section is normative.

The assessed baseline was corrected from `curl-link-hub (5).zip` to the current
declared export `curl-link-hub (7).zip` (SRC-001; see V1-05.0 and REG-107
DEC-V1-011). The product and experience conclusions below hold on the corrected
baseline: the stack, surface classification, and duplication findings are
unchanged in kind. Corrected counts: 155 routes, 101 functions, 95 entities, 151
page components, 604 other components. The `(7)` export adds two product domains
that the original `(5)` assessment did not describe - an **IEBOK** body-of-
knowledge module and a **Jobs board** (see V1-05.0; CAP-017, CAP-018; FND-021,
FND-022). Both are new, un-qualified surfaces dispositioned DEFER and inherit the
same client-authority / direct-mutation posture assessed in V1-08; they do not
change the product architecture conclusions of this chapter.

## V1-06.1 Purpose

This section is normative.

This chapter describes what Base44 is as a product and an experience: its stack,
its surfaces, and the maturity of each surface. Its role is to extract validated
product intelligence about how the domain was modelled and navigated, while
classifying each surface honestly so that prototype breadth is never mistaken for
production readiness. It qualifies no capability and authorizes no work.

## V1-06.2 Technical stack (observed)

This section is normative.

- Frontend: React 18 + Vite + Tailwind, with Radix/shadcn UI primitives (27
  Radix packages). Client-side routing via `src/App.jsx` (148 routes).
- Backend: 99 Deno serverless functions (`Deno.serve`, `@base44/sdk`), operating
  against Base44-hosted entities.
- Data: 87 JSON-schema entities with app-layer `rls` blocks (Mongo-style access
  rules evaluated in application logic, NOT PostgreSQL row-level security).
- Payments: Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`).
- Localization: homegrown i18n utility plus an admin Translations surface.

This is a rapid application-builder stack. It is coherent for prototyping and
demonstrates domain thinking; it is not a governed system-of-record architecture.

## V1-06.3 Surface classification

This section is normative.

Every material surface is classified into one of six honest categories. The
purpose is to prevent counting a placeholder or an unconnected screen as
delivered capability.

- **Implemented** - a surface with a backing entity and a server function that
  reads or writes it (for example, the affiliation Application flow; entity
  management screens).
- **Prototype** - a surface that renders and navigates but whose enforcement,
  atomicity, or authority is incomplete (for example, role dashboards gated only
  on the client; approval actions that mutate status directly).
- **Placeholder** - a surface present in navigation with little or no backing
  behaviour (thin analytics/reporting screens; Club 360 substance is thin).
- **Conceptual** - documented intent without a corresponding implemented surface
  (much of the 231-document governance narrative; SRC-007).
- **Unconnected** - a component that exists but is not reachable through a guarded
  route, or a route with no matrix entry (18 routes have no matrix entry).
- **Duplicated** - multiple surfaces addressing the same need (multiple
  dashboards for staff/club/member/volunteer/fan; multiple club views).

The candidate capability-domain overlap analysis (`capability-domain-analysis.json`)
is an indicative (E2) signal of duplication; specific duplicates are named by
direct inspection, not by the overlap count alone.

## V1-06.4 Domain model intelligence (validated value)

This section is normative.

Independent of implementation quality, the Base44 corpus encodes reusable product
intelligence about the Curling Canada domain:

- A national hierarchy: Curling Canada -> PTSO -> Club -> Member, with an
  `org_id`-scoped tenancy concept (CAP-002).
- A club affiliation lifecycle with an explicit status vocabulary: `submitted`,
  `ptso_review`, `ptso_approved`, `cc_review`, `approved`, `rejected`,
  `more_info_needed`, and an `application_type` of `new_affiliation`, `renewal`,
  or `transfer` (CAP-001; EV-006).
- Compliance, consent, waiver, and safe-sport concepts (CAP-006).
- A fee/payment concept expressed through a recognized processor (CAP-008).
- A rich role vocabulary (23 fine role keys plus coarse buckets) expressing how
  many distinct actors the domain contains (CAP-014).

This is genuine, reusable requirements intelligence. It is E2 at best: it reflects
one team's model of the domain and has not been validated by clubs, PTSOs, or
Curling Canada stakeholders (FND-016).

## V1-06.5 Experience navigation and duplication

This section is normative.

The experience layer offers many role-specific dashboards, a command palette, and
overlapping landing surfaces. The access/navigation doctrine assumes one
authoritative surface per capability per role, yet multiple surfaces coexist for
the same need (CON-005; FND-011). For the target, these should be consolidated
into a small set of governed workspaces in the experience layer (The Button), not
carried across one-for-one (CAP-015, disposition CONSOLIDATE).

## V1-06.6 Localization posture

This section is normative.

Localization is homegrown rather than built on a standard i18n framework. Five
i18n files and an admin Translations surface are present. Bilingual (English and
French) coverage completeness and quality are NOT established by the export and
remain an open evidence question (FND-015, E1). Given Curling Canada's
official-language context, this is a material unknown to carry forward, not a
solved problem.

## V1-06.7 Evidence and cross-references

This section is informative.

- Surfaces and routing: REG-102 (EV-001, EV-013), SRC-008
- Domain model: REG-102 (EV-002, EV-006, EV-012), SRC-004
- Capabilities: REG-103 (CAP-001..016)
- Duplication and localization findings: REG-104 (FND-011, FND-015, FND-016)
- Contradictions: REG-105 (CON-005, CON-006)

This chapter records product architecture only. It does not qualify capabilities
(V1-07), assess security/authority (V1-08), or authorize any construction.
