# `identity` — Actors, roles, and access model (module boundary placeholder)

Owns the NSO-generic identity/access concepts used by the kernel's permission checks:
actors, generic role keys, and scope resolution. Permission enforcement is **server-side
and fail-closed** — unknown permissions deny.

**Scaffold status:** boundary only. The actor contract (`TransitionActor`, with generic
scope fields — `tenantId`, `scopeType`, `scopeId`, `organizationId`, etc.) lives in
[`../governance/types/TransitionTypes.ts`](../governance/types/TransitionTypes.ts).

NSO-generic constraint:
- Use generic scope naming (`scopeType`/`scopeId`, national/regional/local organization).
- Do **not** introduce sport-specific identity fields (`ptsoId`, `clubId`, `curlerId`) in
  this layer. Those belong to sport-profile adapters, fixtures, or examples only.
