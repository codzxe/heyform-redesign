# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on `codzxe/heyform-redesign`. The `gh` CLI is preferred when available; all operations below also work as plain REST calls with `Authorization: Bearer $GH_TOKEN` (the CLI is not guaranteed on every machine).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."` (heredoc for multi-line) or `POST /repos/codzxe/heyform-redesign/issues` with `{title, body, labels}`.
- **Read an issue**: `gh issue view <number>` or `GET /repos/codzxe/heyform-redesign/issues/<number>`.
- **List issues**: `gh issue list --state open` or `GET /repos/codzxe/heyform-redesign/issues?state=all&per_page=100` (filter out `pull_request` entries).
- **Sub-issues**: tickets are sub-issues of their spec. `gh issue edit <parent> --add-sub-issue <child>` (gh 2.94+) or `POST /repos/codzxe/heyform-redesign/issues/<parent>/sub_issues` with `{"sub_issue_id": <child database id>}`.
- **Blocking edges**: native issue dependencies. `gh issue edit <child> --add-blocked-by <blocker>` or `POST /repos/codzxe/heyform-redesign/issues/<child>/dependencies/blocked_by` with `{"issue_id": <blocker database id>}` (database id from `GET .../issues/<n>` → `.id`, not the `#number`). A ticket is startable when every blocker is closed.
- **Frontier query**: open tickets with zero open blockers — the epic (#50) maintains the current list.
- **Comment / label / close**: `gh issue comment|edit|close <n>` or the corresponding REST endpoints.

## Label vocabulary

Category: `bug`, `enhancement`. State: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Structure: `spec`, `epic`. Area: `area:foundations`, `area:infra`, `area:saas`, `area:product`, `area:layout`, `area:roadmap`. Roadmap phase: `roadmap:launch`, `roadmap:v2`, `roadmap:wishlist`.

Tickets created from specs are born `ready-for-agent`; anything newly filed by hand starts `needs-triage`.

## Working rules

- One ticket = one branch = one PR; PRs close their ticket (`Closes #<n>`).
- Never file issues into repositories other than the maintainer's own.
- The wiki (`docs/agents/wiki/`) records decisions and audit history; issues are the work memory.
