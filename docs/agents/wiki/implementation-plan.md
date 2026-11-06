# Implementation Plan — Multi-Agent Execution

Written 2026-11-06 against issue map of the same date (epic #50). This describes *how* agents should execute, not what (that lives in the issues).

## Model

- **One ticket = one branch = one PR.** Branch naming: `agent/<ticket-number>-<slug>` (e.g. `agent/12-upstash-queue-core`).
- **Git worktrees per agent** to avoid working-tree contention when several agents run in parallel: `git worktree add ../wt-<n> -b agent/<n>-<slug> main`. Each worktree shares the clone's object store, so disk cost is low.
- PR description cites the ticket (`Closes #<n>`) and includes before/after screenshots for layout work.
- Every PR must pass `pnpm check` (created by ticket #11; until then: lint + typecheck + unit tests + relevant e2e).
- Agents commit with the repo-local identity; a human or the coordinating session pushes/opens the PR (token stays in the environment, never in files).

## Waves (from the dependency graph in epic #50)

**Wave 1 — frontier today (11 tickets):** #7 T1 config validation · #8 T2 branding residue · #11 T5 CI orchestration · #12 U1 Upstash queue core · #16 S1 plans model · #27 C1 wire dual layouts · #31 C5 realtime analytics · #32 C6 exports · #33 L1 app shell · #34 L2 builder layout · #45 R9 integrations (v2, optional).

Recommended parallel start (4 agents, independent areas):
1. **#27 C1** (renderer wiring — highest product value; unblocks C2/C3/C4/L3)
2. **#12 U1** (Upstash queue core — the maintainer's explicit requirement; unblocks U2/U3/U4/R1)
3. **#33 L1** (app shell restructure — the layout mandate; unblocks L4/L5)
4. **#16 S1** (plans/entitlements model — unblocks the whole SaaS spec)

Follow with: #7/#8/#11 (quick foundations, low conflict), then wave 2 as blockers close (#13 U2, #17 S2, #19 S4, #28 C2, #35 L3 …).

## Conflict avoidance

- C-tickets touch `packages/form-renderer` + builder UI; L-tickets touch `packages/webapp/layouts` + page containers; U/S-tickets touch `packages/server`. L1 overlaps webapp pages that C5/C6 dashboards use — merge L1 before C5-heavy UI polish; keep C5's server-side work parallel.
- Merge order when two PRs touch the same package: foundations (T*) first, then features, then layout polish.
- Any PR that changes `globals.scss` token values or font configuration fails review per the layout mandate.

## Verification duty

Each PR states: commands run (lint/typecheck/tests), evidence of real end-to-end behavior (screenshots, curl transcripts, test output), and the ticket's acceptance criteria checked off. Definition of done lives in epic #50.
