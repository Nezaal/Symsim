#      SystemSim database design

## Foundations (decided)

- **Database:** Supabase (hosted Postgres). During development it runs locally in Docker.
- **Auth:** Supabase Auth with Google and GitHub OAuth. Supabase owns `auth.users`;
  our tables only reference a user's id.
- **Security model:** Row Level Security on every table. The browser talks to the
  database directly, and Postgres enforces access on every request.
- **Schema source of truth:** migration files in `supabase/migrations/`, in git.
- **Where the engine runs:** in the browser, in a Web Worker. There is no separate
  backend service: the app is the frontend (Vercel) plus Supabase. Simulations and
  results are written by the user's own client, and RLS limits each user to their own
  rows. `packages/engine` stays framework-free, so it can later run server-side
  (Edge Functions or Node) if verified results or long runs are needed.

### MVP entities

| Entity | What it is |
|---|---|
| profile | Public info about a user. One per `auth.users` row. |
| project | A named architecture owned by a user. Private or public. |
| project version | A snapshot of a project's architecture graph at a point in time. |
| simulation | One run: its workload settings and the version it ran against. |
| simulation result | What a run produced: metrics and the bottleneck. |
| share link | A read-only link to **one specific version**. Revocable on its own, and there can be several per project. |

**Not stored:** templates and component types (they live in code, in `packages/engine`);
comparisons (calculated from two results when needed).

**Deferred:** team collaboration (`project_members` with viewer/editor roles), as a
later migration. The MVP rules are "owner only", plus public/share read access.

---

## Schema brief (MVP)

Write `supabase/migrations/<timestamp>_initial_schema.sql`. This brief states
**requirements only**: table names, column names and types, and how to meet each
requirement are your design. Wherever the brief says **Decide**, record your
choice and reasoning under *Design decisions* below.

### profile
- [ ] Exactly one profile per auth user, **created automatically on sign-up**. The
      frontend never inserts profiles.
- [ ] A username that is **unique case-insensitively** (`Ada` and `ada` clash), with
      format rules (allowed characters, length).
      **Decide:** what does a new OAuth user's username start as?
- [ ] Display name and avatar URL, filled from the OAuth provider's data when available.
- [ ] **Decide:** which profile fields can other users and signed-out visitors see?
      (For example, the author name shown on a public project.)

### project
- [ ] Owner, name (length limits), optional description, and visibility (private or public).
- [ ] `created_at` and `updated_at`; **`updated_at` is maintained by the database**,
      not by the client.

### project version
- [ ] Belongs to a project. Has a **sequential number within its project**
      (1, 2, 3…), unique within the project.
- [ ] Holds a snapshot of the architecture graph, meaning the editor's
      `{ nodes, edges }` from `frontend/src/store/architectureStore.js`.
      **Decide:** one JSONB document per version, or normalized node/edge tables?
- [ ] Optional message ("added a cache").
- [ ] **Immutable once saved:** it can be inserted or deleted, never updated.
      The database must enforce this, not the UI.
- [ ] Snapshot size is bounded, so that one user can't store a 50 MB graph (spec §11).

### simulation
- [ ] Runs against exactly one project version.
- [ ] Stores the workload configuration: requests per second, duration, seed, traffic
      pattern… **Decide:** columns or JSONB, and which values must be validated.
- [ ] Status lifecycle: `queued → running → completed | failed | cancelled`.
- [ ] Started and finished timestamps that are **consistent with the status**. For
      example, a `completed` run must have a finish time, and a `queued` one must not.

### simulation result
- [ ] Summary metrics: throughput, p50/p95/p99 latency, error rate, and totals for
      successful, failed, rejected and timed-out requests, plus the bottleneck component.
- [ ] **Decide:** one result per simulation, or several? A separate table, or columns on
      the simulation?
- [ ] **Decide:** store time-series chart data or not? If yes, how is its size bounded?

### share link
- [ ] Points to exactly one project version.
- [ ] Carries an **unguessable token** used in the URL. Sequential or short ids are not acceptable.
- [ ] Can be revoked, and can optionally expire.
- [ ] A **signed-out visitor holding the token** can read that version, and only while
      the link is active. Nobody can **list** share links or tokens they don't own.

### Deletion behavior
- [ ] Deleting a user removes everything they own.
- [ ] Deleting a project removes all of its versions, simulations, results and links.
- [ ] **Decide:** deleting a version that has simulations or share links: block the
      delete, or cascade? Record why.

### Security (RLS)
- [ ] RLS is enabled on **every** table in `public`.
- [ ] Owners have full access to their own rows. Nobody else can insert, update or delete anything.
- [ ] Anyone, including signed-out visitors, can read **public** projects and their versions.
- [ ] Share-link reads work as described above.
- [ ] Policies derive identity from `auth.uid()`, never from values the client sends.

### Queries the app will run (drive your indexes)
1. My projects, most recently updated first.
2. A project's versions, newest first.
3. All simulations of a version, newest first.
4. Resolve a share token to its version.
5. Browse public projects, most recently updated first.

### Stretch
- [ ] Per-user quotas (spec §11). For example, a maximum of 50 projects per user and
      200 versions per project, enforced in the database.

**Done when:** `npx supabase db reset` applies the migration cleanly, the checklist
above is met, and *Design decisions* is filled in.

---

## Design decisions

Implemented in `supabase/migrations/20260930154945_initial_schema.sql`.
Smoke test: `supabase/scripts/rls_smoke.sql`.

| Decision | Choice | Why |
|---|---|---|
| Profile primary key | Same as the `auth.users` id, with `on delete cascade` | `auth.uid()` matches directly, exactly one profile per user, and it's removed with the account. |
| Initial username | `user_` + 12 hex chars of the user id | Always valid and unique at sign-up; the user can rename it later. |
| Public profile fields | All of them (username, display name, avatar) | Profiles contain nothing private; emails stay in `auth.users`. |
| Graph storage | One `jsonb` document per version, capped at 1 MB | A version is always read and written as a whole, and never queried node by node. It matches the editor's `{ nodes, edges }` exactly, and immutability is trivial. |
| Workload config | Validated columns (`duration_seconds`, `seed`) plus `workload jsonb` (64 KB) | The engine's request-mix format isn't designed yet. JSON avoids a migration every time it changes. |
| Results per simulation | One (`simulation_id` is the primary key) | A run produces one outcome. Re-running creates a new simulation. |
| Time-series data | Optional `timeseries jsonb`, capped at 2 MB (downsampled) | The results drawer needs charts after reload. The cap stops a runaway blob. |
| Deleting a version | **Cascade** to its simulations, results and share links | Those rows are meaningless without the graph they refer to. A link to a deleted version must die, not dangle. |
| Share tokens | 64 hex chars from two random UUIDs, looked up via `get_shared_version(token)` | About 244 random bits, so unguessable. The function returns only the one active version, so visitors can never list `share_links`. |
| Version numbers | Assigned by a trigger that locks the parent project row | Clients can't choose or collide on numbers, even when saving at the same moment. |
| Immutability | No update policy **and** a trigger that raises on update | RLS stops users; the trigger also stops admin/service-role code. |
| Quotas | 50 projects per user, 200 versions per project (triggers) | Spec §11: stop one account from exhausting storage. |
