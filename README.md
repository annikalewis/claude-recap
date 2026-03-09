# /recap — Claude Code session recap skill

A Claude Code skill that synthesizes your session history into a readable recap. Ask it what you worked on today, yesterday, or any specific date — and it reads your actual Claude Code sessions and tells you, honestly.

```
/recap              → what you did today
/recap yesterday    → yesterday
/recap week         → past 7 days
/recap 2026-03-05   → a specific date
```

Example output:

> **Recap — yesterday, Thursday 2026-03-05**
>
> **What you worked on:**
> - **Personal website design sprint** (~335 min) — Built three design variants side-by-side, picked the Statement Headline direction, ported it into VitePress. 23 commits by end of session.
> - **Instacart integration brainstorm** (~58 min) — Explored adding photo-to-cart flow to the /grocery skill. Feasibility conversation, no code written.
>
> **Where you got stuck:**
> - Image path misconfigurations needed several rounds of fixes
>
> **A thread worth remembering:**
> You ran a proper design sprint — build options in parallel, compare in the browser, pick one, commit to it.

---

## How it works

Claude Code stores every conversation as a JSONL file in `~/.claude/projects/`. This skill has two parts:

1. **`index.ts`** — a lightweight TypeScript script that scans those files and returns session metadata (timestamps, turn counts, duration, first message) for the requested time period
2. **`skill.md`** — instructions that tell Claude how to use the index, which sessions to read in full, and how to synthesize a recap

Claude reads the actual session files directly — no regex parsing, no templates. This means it understands context, groups work thematically, and reports light days honestly ("11-minute session, you opened it briefly") rather than inflating them.

Sessions that span midnight are handled correctly: only turns within the requested date's local-time boundaries are included.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) — the CLI tool from Anthropic
- [Bun](https://bun.sh) — a fast JavaScript runtime (used to run the indexer)

Install Bun if you don't have it:
```bash
curl -fsSL https://bun.sh/install | bash
```

---

## Install

```bash
git clone https://github.com/annikalewis/claude-recap
cd claude-recap
bash install.sh
```

Then in any Claude Code session:
```
/recap
```

---

## Updating

If you pull changes from this repo:
```bash
bash install.sh
```

That re-copies the files to `~/.claude/skills/recap/`.
