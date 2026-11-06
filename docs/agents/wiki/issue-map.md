# Issue Map — 2026-11-06

The complete GitHub issue system created from the maintainer's requirements. Epic index with the live frontier: **#50**.

| Spec | Area | Tickets |
| --- | --- | --- |
| #1 Foundations — validated configuration, zero hardcoding, branding & CI guardrails | foundations | #7 T1 · #8 T2 · #9 T3 · #10 T4 · #11 T5 |
| #2 Upstash Redis migration | infra | #12 U1 · #13 U2 · #14 U3 · #15 U4 |
| #3 SaaS platform — billing, plans, entitlements, metering, quotas | saas | #16 S1 · #17 S2 · #18 S3 · #19 S4 · #20 S5 · #21 S6 · #22 S7 · #23 S8 · #24 S9 · #25 S10 · #26 S11 |
| #4 Respondent experience completion | product | #27 C1 · #28 C2 · #29 C3 · #30 C4 · #31 C5 · #32 C6 |
| #5 Layout upgrade (palette/fonts unchanged) | layout | #33 L1 · #34 L2 · #35 L3 · #36 L4 · #37 L5 |
| #6 Feature roadmap — launch / v2 / wishlist | roadmap | launch: #38 R1 · #39 R2 · #40 R3 · v2: #41–#48 · wishlist: #49 R13 |

Structure: every ticket is a GitHub **sub-issue** of its spec; blocking relationships use GitHub **native issue dependencies** (`blocked_by`), so each ticket's UI shows what gates it. Labels: `spec`, `epic`, `ready-for-agent`, `area:*`, `roadmap:launch|v2|wishlist`.

Dependency edges (child ← blocked by): #9←#7 · #10←#7 · #13←#12 · #14←#13 · #15←#12 · #17←#16 · #18←#17 · #19←#16 · #20←#16,#13 · #21←#16,#10 · #22←#17,#18 · #23←#16 · #24←#19,#20,#18,#22 · #25←#19 · #26←#24,#21,#22 · #28←#27 · #29←#27 · #30←#27 · #35←#27 · #36←#33,#34 · #37←#33 · #38←#12 · #39←#7 · #40←#7 · #41←#27 · #42←#27,#28 · #43←#27 · #44←#40,#27 · #46←#16,#27 · #47←#27 · #48←#27 · #49←#27.

Already-implemented features that are NOT re-specced (verified by the 2026-11-06 audit): AI form/fields/logic/theme generation, AI form translation, real transcription, quiz scoring + public leaderboard, choice limits, per-IP submission limits, reCAPTCHA + Akismet, save/resume session *model*, consent records, GDPR deletion requests, retention jobs, scheduled reports, analytics + heatmap, public dashboard shares, embed modes (standard/modal/popup/fullpage), projects, team roles + invitations, Stripe Connect respondent payments.
