# Database Seed — The House v2

This folder holds **operational / demonstration seed data**, kept separate from
schema migrations.

> **Scaffold status:** empty placeholder. No seed scripts exist yet.

## Rules

- **Migrations vs seed.** Required *platform* policy/config (the governed state machine,
  guard catalog) lives in migrations under [`../migrations`](../migrations). Everything
  else — example tenants, demo organizations, sample applications — belongs here.
- **No real tenant data.** Seed data is synthetic and clearly marked. Real organization,
  participant, or member data is never committed.
- **NSO-generic core, sport-specific examples allowed.** Curling Canada reference data is
  permitted here *only* as clearly labelled example/fixture data, never as platform-core
  defaults.
- **Idempotent.** Seed scripts must be safe to run repeatedly (upsert / guarded inserts).

`npm run db:seed` is a placeholder script in this scaffold; a real seeder is wired in the
implementation pass.
