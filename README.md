# /recap — Claude Code session recap skill

A Claude Code skill that synthesizes your session history into a readable recap. Ask it what you worked on today, yesterday, or any specific date — and it reads your actual Claude Code sessions and tells you, honestly.

```
/recap              → what you did today
/recap yesterday    → yesterday
/recap week         → past 7 days
/recap 2026-03-05   → a specific date
```

Example output (real, not fabricated):

> **Recap — 2026-03-05, Thursday**
>
> **What you worked on:**
> - **Personal website design sprint** (~335 min) — Picked back up after hitting rate limits the day before. Built three distinct design variants, compared them side-by-side in the browser, and chose the Statement Headline direction. Committed to iterating on that one rather than chasing all three.
> - **VitePress implementation** (~120 min) — Ported the winning design into VitePress, created data files with real content and URLs, fixed image paths, debugged card preview rendering. 23 commits across the evening.
> - **Instacart integration brainstorm** (~58 min) — Explored adding photo-to-cart flow to the /grocery skill. Feasibility conversation, no code written.
>
> **Where you got stuck:**
> - Multiple image path misconfigurations that needed iterative fixes
> - Card preview rendering kept being inconsistent — sizing and thumbnail alignment
>
> **A thread worth remembering:**
> You ran a proper design sprint — build options in parallel, compare in the browser, pick one, commit to it.

And for a light day:

> **Recap — 2026-03-08, Sunday**
>
> Light evening. One session, ~11 minutes.
>
> You opened Claude Code and kicked off planning for a content automation system. That was it. The real work happened the next day.

---

## How it works

Claude Code stores every conversation as a JSONL file in `~/.claude/projects/`. Most people don't know this — but it means your full session history is queryable.

This skill has two parts:

1. **`index.ts`** — a lightweight TypeScript script that scans those files and returns session metadata for the requested time period: timestamps, turn counts, duration, and the first message. Metadata only — no content parsing.

2. **`SKILL.md`** — instructions that tell Claude how to use that index, decide which sessions are worth reading in full, and synthesize a recap.

**The key design decision:** Claude reads the actual session files directly rather than extracting excerpts with regex. This matters because regex parsers can't understand context — they just match patterns. Claude reading the raw JSONL understands what you were actually trying to do, groups work by theme, and can distinguish "this was the real problem" from "this was scaffolding noise."

**Light days are reported honestly.** If the index shows one session and 11 minutes of activity, the recap says so — it doesn't pad a brief session into a bulleted list of accomplishments.

**Sessions that span midnight are handled correctly.** Each session entry includes `startTime` and `endTime` scoped to the requested date's local-time boundaries. If you started a session Sunday evening and kept going Monday, asking for Sunday only synthesizes Sunday's turns.

---

## What it doesn't do

- **Only works with Claude Code sessions** — not Claude.ai, not the API. Your sessions need to be in `~/.claude/projects/`.
- **Doesn't write anything** — read-only, no files saved
- **Doesn't access the internet** — everything is local

---

## Prerequisites

- [Claude Code](https://claude.ai/code) — the CLI tool from Anthropic

---

## Install

Add this marketplace to Claude Code:

```
/plugin marketplace add annikalewis/claude-recap
```

Then install the recap skill:

```
/plugin install recap@annikalewis
```

Then in any Claude Code session:

```
/recap
```

---

## Updating

```
/plugin marketplace update annikalewis
/plugin install recap@annikalewis
```

---

## Related

- [claude-content-week](https://github.com/annikalewis/claude-content-week) — the companion `/content-week` skill for weekly content planning
