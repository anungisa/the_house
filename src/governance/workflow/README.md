# `governance/workflow` — Approval workflow (module boundary placeholder)

Owns approval-required transition handling: when a transition requires approval, the
kernel creates a `transition_request` and a workflow placeholder **without mutating**
`entity_state`.

**Scaffold status:** boundary only. No workflow engine, no implementation.

## Forward-compatible review hooks (placeholder only — NOT in the v1 FSM)

The legacy app had a two-tier PTSO/CC review and a `more_info_needed` status. These are
**deferred workflow concerns**, not v1 FSM states. When implemented later, they will be
expressed as:

- **workflow metadata** on the transition request (carried today via
  `TransitionContext.workflowMetadata`),
- **approval-tier sign-offs** (sequenced approver records),
- **return-for-more-info** handling as a transition-request outcome / loop,
- **review substate metadata** and **sport-profile-specific review terminology**.

Do **not** expand the v1 FSM (`draft → submitted → under_review → approved/rejected →
active → suspended → revoked → closed → archived`) to add these. They remain metadata and
workflow concerns layered on top of the kernel.

Rules:
- Approval handling never mutates governed state directly.
- Workflow runs on top of the kernel; it does not replace it.
- This is **not** a generic JSON workflow/rule engine.
