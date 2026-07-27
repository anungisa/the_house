# V7-45 - Actor, Authority, Task, Action, and Workbench Crosswalk

Document ID: V7-45
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V7-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V7-G5)

## V7-45.1 Purpose

This section is normative.

This chapter establishes the authoritative crosswalk between actors, their governed authority, the tasks they perform, the actions those tasks request, and the workbenches through which staff actors work. It consolidates the actor and authority definitions of Packages 1 through 4 into one settled mapping. It consolidates; it authorizes no implementation and grants no authority.

## V7-45.2 Actors in scope

This section is normative.

The crosswalk covers every governed actor of the affiliation experience: the club representative; the delegated representative; the reviewer; the national reviewer; the finance actor; the support actor; the privacy actor; the records actor; the administrator; and the service identity. Each actor is defined by the governed authority it holds and the tasks it may perform, not by any interface it uses.

## V7-45.3 Crosswalk structure

This section is normative.

For every actor, the crosswalk records the governed authority the actor holds, the tasks the actor performs, the actions those tasks request of the House, the queries those tasks read from the House, and the workbench through which a staff actor performs them. Every action maps to a governed House command intent, and every governed command names the House authority it requires. These mappings are projected non-authoritatively under the generated final-closure directory and trace to the frozen Package 1 through 4 records that define them.

## V7-45.4 Authority distinctions preserved

This section is normative.

The crosswalk preserves the settled authority distinctions of the platform. An account is not a membership, is not representative authority, is not a delegation, is not a reviewer assignment, is not finance authority, and is not support authority. A Button action is a request for a governed House action and is never an independent institutional mutation. The crosswalk records these distinctions explicitly so that no actor is granted authority by virtue of the surface it uses.

## V7-45.5 Workbench separation

This section is normative.

Staff actors work through workbenches whose authority postures are distinct. The reviewer, finance, support, privacy, and administrative workbenches each expose only the actions and data their actor is authorised to reach, and each carries the constraints that bound its authority. The crosswalk records, for each workbench, the actor it serves and the authority constraints that separate it from every other workbench.

## V7-45.6 Completeness and neutrality

This section is normative.

The crosswalk is complete when every actor has at least one governed need and task, every task maps to a governed action or query, and every governed action maps to a House command intent. Where any of these mappings is absent, the closure assessment records the gap. The crosswalk defines authority relationships; it does not implement authorization, and it asserts no runtime enforcement.

## V7-45.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It performs no validation and accepts no result. It grants no actor any authority and enforces no authorization at runtime. It creates no production user interface, production content, validated translation, coded interface, design-system implementation, executable workflow, or interface or integration contract, and no procurement, sequencing, staffing, cost, pilot, rollout, or master development plan. Every controlled record remains in a not-implemented-or-not-proven posture.
