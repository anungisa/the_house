# The House v2

The House v2 is the governed enterprise backend platform core for Canadian National
Sport Organization (NSO) operations. It is the governed system-of-record and platform
core beneath experience layers (such as The Button).

This is an enterprise backend/platform repository, **not** a frontend prototype.

## Architecture

- Governance-first **modular monolith** (no microservices by default)
- PostgreSQL-backed, tenant-aware state with Row-Level Security (RLS)
- Deterministic workflows driven by a non-bypassable **Governance Kernel**
- Versioned governance policy, append-only audit, immutable evidence metadata
- Transactional outbox for reliable, idempotent external side effects

The Governance Kernel is the sole authority for governed lifecycle state transitions.
Domain modules may *request* transitions but must never directly mutate governed state.

## AI Agent Instructions

AI assistants working in this repo must follow the governance rules defined in:

- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — Copilot engineering posture and kernel rules
- [`AGENTS.md`](AGENTS.md) — non-negotiable rules and scope control for AI agents
- [`.cursor/rules/house-v2-governance-kernel.mdc`](.cursor/rules/house-v2-governance-kernel.mdc) — Cursor rules
- [`docs/adr/ADR-0001-house-v2-governance-kernel.md`](docs/adr/ADR-0001-house-v2-governance-kernel.md) — architecture decision record
- [`docs/ai/house-v2-governance-kernel-vertical-slice.md`](docs/ai/house-v2-governance-kernel-vertical-slice.md) — first vertical slice specification

## Status

Early scaffolding. The first implementation slice is the **AffiliationApplication v1**
Governance Kernel lifecycle.
