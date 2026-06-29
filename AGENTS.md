# AI Agent Instructions — The House v2

## Purpose

This repository contains The House v2: the governed enterprise backend platform for Canadian NSO operations.

The House v2 is **not** The Button. The Button is a stakeholder/public experience layer. The House v2 is the governed system-of-record and platform core.

AI agents working in this repo must preserve that separation.

## Primary Architecture

The House v2 starts as a **governance-first modular monolith**.

Do not introduce microservices unless a human explicitly asks for that architectural change.

The platform core owns:

- identity context
- tenancy
- permissions
- lifecycle state
- audit
- evidence
- consent
- workflow
- idempotency
- outbox messaging
- API contracts
- durable system-of-record data

Experience layers may request actions, but they must not own governed lifecycle rules.

## Non-Negotiable Rules

1. Do not build frontend UI unless explicitly requested.
2. Do not work on The Button unless explicitly requested.
3. Do not add unrelated product modules.
4. Do not create a dynamic JSON expression rule engine.
5. Unknown transitions must fail closed.
6. Unknown guards must fail closed.
7. Unknown permissions must fail closed.
8. Domain modules must not directly mutate governed state/status fields.
9. Every governed lifecycle transition must go through the Governance Kernel.
10. Every tenant-owned table must include tenant isolation.
11. External side effects must not happen inside governance transactions.
12. Outbox publishing must be retry-safe and idempotent.
13. Do not use Azure Service Bus sessions in v1.
14. Do not silently weaken audit, evidence, idempotency, or RLS controls.

## Scope Control

When asked to implement a vertical slice, complete only that slice.

Do not opportunistically add:

- frontend pages
- new dashboards
- extra domain models
- generic workflow builders
- marketplace/plugin systems
- analytics platforms
- AI features
- microservices
- extra integrations

If a missing dependency is required, stub it clearly and report the stub.

## Governance Kernel Principle

All governed lifecycle changes in The House v2 must be executed through the Governance Kernel state machine.

Domain modules may request transitions, but they may not directly mutate governed state.

Every transition must resolve to a versioned policy, evaluate registered guards, enforce tenant-scoped authorization, record immutable history, and produce audit/evidence artifacts according to risk level.

## Reporting Expectations

At the end of every AI-assisted change, report:

- files changed
- migrations added
- tests added
- commands run
- test/build results
- unresolved gaps
- intentional stubs
- any deviation from these instructions
