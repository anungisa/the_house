# V7-13 - Affiliation Initiation, Jurisdiction, Season, Pathway, and Applicability Interaction Model

Document ID: V7-13
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G2)

## V7-13.1 Purpose

This section is normative.

This chapter specifies the interaction model for initiating or continuing an affiliation and for presenting jurisdiction, season, pathway, and applicability. It records the relevant command and query intents in register REG-702 and the initiation views and flows in register REG-701.

## V7-13.2 Initiation and continuation

This section is normative.

Starting or continuing an affiliation expresses a command intent to the House affiliation-lifecycle authority for a specific season and jurisdiction. When an affiliation is already active, withdrawn, expired, or duplicated, the interaction presents the existing case state and a meaningful next action rather than silently creating a new case.

## V7-13.3 Derived applicability

This section is normative.

Jurisdiction, season, pathway, and applicable requirements are derived from House facts. They are read through query intents against authoritative live House data and are never entered or asserted by the user. The interaction presents applicability as derived truth attributed to the House.

## V7-13.4 Applicability disclosure

This section is normative.

Applicability disclosure presents only the requirements derived as applicable for the resolved jurisdiction and season. It discloses the basis of applicability in plain language and never conceals an institutional obligation through progressive disclosure.

## V7-13.5 Explicit non-authorizations

This section is normative.

This chapter does not authorize production user interface, executable workflows, interface or integration contracts, final visual design, branded mockups, design tokens, production content, translations, procurement, staffing, cost commitments, pilots, rollout, or a master plan. It defines documentary interaction behaviour only, pending Gate V7-G2.
