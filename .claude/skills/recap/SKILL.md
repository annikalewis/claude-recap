---
name: recap
description: Synthesize your Claude Code session history into a readable recap. Use for /recap, /recap today, /recap yesterday, /recap week, or /recap YYYY-MM-DD.
---

# /recap

Shows what you worked on in Claude Code — synthesized from your actual session history.

## Usage

```
/recap              → today (default)
/recap today        → today
/recap yesterday    → yesterday
/recap week         → past 7 days
/recap 2026-03-05   → a specific date
```

---

## Implementation

### Step 1: Parse the time period

Read the argument after `/recap`. Map it:
- No argument → "today"
- "today" → today
- "yesterday" → yesterday
- "week" → past 7 days
- Any `YYYY-MM-DD` string → that specific date

### Step 2: Run the indexer

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/index.ts --period {period}
```

This outputs a JSON array of session metadata. Each entry has:
- `sessionId` — UUID
- `filePath` — absolute path to the `.jsonl` file
- `projectLabel` — which repo/project it was in
- `date` — YYYY-MM-DD (local time)
- `startTime` — ISO timestamp of first turn **within the requested range**
- `endTime` — ISO timestamp of last turn **within the requested range**
- `durationMinutes` — wall-clock minutes between first and last in-range turn
- `turnCount` — number of real exchanges within the range
- `fileSizeKb` — file size
- `firstUserMessage` — first real user message within the range

If no sessions are found, say: "No Claude Code sessions found for {period}."

### Step 3: Decide which sessions to read in full

**Skip** sessions that are clearly throwaway:
- `turnCount` under 4
- `durationMinutes` under 2
- `firstUserMessage` is a one-liner with no substance (e.g. "what model are you using?")
- Looks like a system-generated session (starts with "The user just ran /insights...")

**If the day looks light** (e.g. only one session, `durationMinutes` under 30), say so plainly. Don't inflate. "Light day — one 11-minute session to kick off planning" is the right output, not a bulleted list of accomplishments.

**Read in full** the sessions that look substantive — use the Read tool on the `filePath`.
For a "today" or "yesterday" recap, read all substantive sessions.
For a "week" recap, read up to 10 most substantive sessions (prioritise by turnCount descending).

**Critical: sessions can span multiple calendar days.** When reading a session file, only synthesize turns that fall between `startTime` and `endTime` from the index entry. Ignore turns outside that window — they belong to a different day's recap.

When reading a session file:
- It's a JSONL file — one JSON object per line
- Look for records with `type: "user"` or `type: "assistant"` and `isSidechain: false`
- The `message.content` field contains the text (either a string or an array of blocks with `type: "text"`)
- Each record has a `timestamp` field — **only process records where timestamp is between the session's `startTime` and `endTime`**
- Skip records whose content starts with `<` (system injections) or "Base directory for this skill:"
- Focus on: what the user was trying to do, where they got stuck, what they learned or built

### Step 4: Synthesize and present

Produce the recap in this format:

---

**Recap — {period label}, {day of week} {date}**

**What you worked on:**

- **{Theme}** ({estimated time}) — {2-3 sentences describing what happened, what was built, what was figured out. Include specifics — tool names, what broke, what worked.}

- **{Theme}** ({estimated time}) — ...

*(repeat for each distinct theme — usually 2-5 bullets for a day, more for a week)*

**Where you got stuck:**
- {One sentence per notable wall you hit — be specific}

**A thread worth remembering:**
{One optional callout — an emerging idea, a question that kept coming up, or something that felt significant but didn't resolve. Skip this section entirely if nothing stands out.}

---

**Formatting rules:**
- Theme names should be descriptive of what you were actually doing, not the repo name. E.g. "Building the /grocery skill" not "email-cleanup".
- Time estimates: use `durationMinutes` from the index as your anchor. "~30min", "~2hr", etc. Don't estimate higher than what the duration supports.
- Write in second person ("you built", "you got stuck") — like a colleague summarising your day
- Be specific. "Fixed the OAuth token expiry issue in the /grocery skill" is better than "worked on a skill"
- For a week recap: group by theme across days, add a one-sentence "zoom out" at the end: "This week's throughline: ..."
- For a day/yesterday recap: no zoom out needed unless something genuinely notable spans the whole day

### Step 5: Done

No file is saved. This is a read-only recap — it just shows you what happened.
If the user wants to dig into a specific session, you can offer to read it in more detail.
