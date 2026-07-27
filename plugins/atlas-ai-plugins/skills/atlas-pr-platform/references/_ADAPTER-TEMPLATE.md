# Adapter template — copy this file to add a platform

**This file is not an adapter.** It is the form you fill in to write one. Nothing routes to it: `SKILL.md` dispatches by remote host, and this file claims no host.

## How to add a platform

1. Copy this file to `references/<platform>.md` (lowercase, hyphenated — `github.md`, `gitlab.md`, `bitbucket.md`).
2. Fill in every section below. A section you cannot answer is a section that will be guessed at runtime, which is how a call ends up shaped for the wrong platform.
3. Add one row to the host table in `SKILL.md` → *Resolve the platform*, mapping the remote host to your new file.
4. Add the platform's CLI to the availability check in `SKILL.md` → *Transport resolution*.
5. Add an eval to `evals.json` covering the platform's most distinctive behaviour — the thing that differs from the others, not the happy path.
6. Bump the skill `version` in `SKILL.md` and the plugin version in all four manifests (see the README's *Versioning*).

**Nothing outside `references/` and those two `SKILL.md` lists should need to change.** Every caller — `/raise-pr`, and any agent or command that reads or answers review comments — knows only the contract, never a platform. If adding a platform pushes you to edit one of them, the contract is missing something: fix the contract, not the caller.

**Verify against a real PR before trusting it.** An adapter written from API documentation alone is a hypothesis. Azure DevOps' adapter was written that way and had four filtering bugs — wrong status type, a field that doesn't exist in the response, and two bad author assumptions — none of which were visible until it ran against a real pull request. Fetch one, list its threads, and check the classification by hand.

---

# Adapter: `<Platform>`

Hosts: `<host>`, `<enterprise/self-hosted host form>`

## RESOLVE_REPO

How to parse the repository identifiers out of the remote URL. Both HTTPS and SSH forms.

```
https://<host>/<...>
git@<host>:<...>
```

State **how many identifiers** the platform needs and what they are — three (org / project / repo), two (owner / repo), one (a nested path)? Say explicitly what this platform does *not* have, so nobody invents a level to fill a gap.

Note anything about enterprise or self-hosted instances: how the host is passed, and what happens if it isn't.

## Transport

**Preferred — MCP.** Server name pattern, and how to pick between several when more than one is configured.

**Fallback — CLI.** Binary name, and how to check it is authenticated.

**Neither** → the exact message: what to install, what to run. Name both routes. State explicitly which fallbacks are *forbidden* and why (e.g. unauthenticated REST that rate-limits or can't see private repos — it fails in a way that looks like the PR doesn't exist).

Branch refs: fully qualified (`refs/heads/<branch>`) or plain branch names?

Any id/number distinction that can silently target the wrong object (global id vs. project-scoped number, etc.).

## Operations

One row per contract operation, mapped to real tools. Mark **unsupported** where the platform has no equivalent — never a lookalike.

| Operation | MCP | CLI |
|-----------|-----|-----|
| `RESOLVE_IDENTITY` | | |
| `FIND_OPEN_PR` | | |
| `CREATE_PR` | | |
| `UPDATE_PR` | | |
| `LINK_WORK_ITEM` | | |
| `LIST_THREADS` | | |
| `REPLY_TO_THREAD` | | |
| `RESOLVE_THREAD` | | |

Say which operations require which transport. If thread operations need one specific API surface (a GraphQL endpoint, a specific MCP server), say so and say what to do on the other transport.

`LIST_THREADS` must return the **full ordered comment list** per thread, with author and timestamp on every comment. Say whether one call gives you that or whether a second per-thread call is needed — and whether it paginates. A truncated first page reads as "no unresolved comments", which is a wrong answer, not a partial one.

## Thread filtering

The section most likely to be wrong. Be concrete about the actual wire format, not the conceptual model.

- **What type is the status field** — string, integer, boolean flag? If it is an enum, write out the full mapping. A comparison against the wrong type matches nothing and lets everything through.
- **Which values mean unresolved**, and which mean settled.
- **How auto-generated threads are recognized** — votes, pushes, policy and build notifications, "joined as a reviewer". Name the field that actually distinguishes them in the response you get by default. Do not name a field that only appears under a verbose flag.
- **Whether system threads are posted under real user identities.** On at least one platform they are, which makes author matching useless as a filter. State it either way.
- **Whether bot reviewers are distinguishable** from human ones, and by which field.

State the order: filter by status **first**, then look at authors. Identity is for counting rounds inside a thread that already passed the filter — never for deciding whether the thread belongs on the list.

**File and line:** which fields carry them, and what a thread with no file position means (PR-level comment — keep it, record the file as `(PR-level)`).

**Review summary posts:** how to recognize an overall verdict with no file attached. It is informational, not a change request.

## Reopen semantics

How a thread comes back after you answered and resolved it. This is what makes round detection work, and platforms differ sharply:

- Does replying to a resolved thread **reactivate** it, or does it stay resolved and drop out of the unresolved set?
- If it stays resolved, what does an unconvinced reviewer do instead — unresolve it, or open a new thread on the same line? If a new thread is the normal shape, say to match on file + line as well as thread id.
- Which field must **not** be used for the "is this us" comparison, and which one must.

## Cross-reference conventions

Exactly what `#`, `!`, and any other sigil mean **on this platform**. Include the cross-repository form.

Never carry a convention over from another platform: the same character means different things, so the wrong one silently links nothing or links the wrong object.

## Work item / issue linking

Does a real PR-to-work-item artifact link exist? If not, say what to use instead (typically a closing keyword in the description) and say what the **side effects** are — a keyword that also closes the issue is not equivalent to a link, and the difference must be reported to the user rather than glossed over.
