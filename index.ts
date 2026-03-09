#!/usr/bin/env bun
/**
 * index.ts
 *
 * Lightweight Claude Code session indexer.
 *
 * Scans ~/.claude/projects/ and produces a JSON array of session metadata —
 * one entry per session file that falls within the requested date range.
 * Intentionally dumb: no parsing decisions, no truncation, no synthesis.
 * The calling skill (Claude) reads this index and decides which sessions
 * to open and read in full.
 *
 * Usage:
 *   bun run index.ts --period today
 *   bun run index.ts --period yesterday
 *   bun run index.ts --period week
 *   bun run index.ts --period 2026-03-05        # specific date
 *   bun run index.ts --period 2026-03-01,2026-03-05  # date range
 *
 * Output: JSON array written to stdout
 *   [
 *     {
 *       "sessionId": "uuid",
 *       "filePath": "/absolute/path/to/session.jsonl",
 *       "projectLabel": "ai-consulting",
 *       "date": "2026-03-05",
 *       "startTime": "2026-03-05T14:23:00Z",
 *       "turnCount": 42,         // real human↔claude exchanges only
 *       "fileSizeKb": 128,
 *       "firstUserMessage": "I want to build a skill that..."
 *     },
 *     ...
 *   ]
 *
 * Sessions are sorted oldest → newest.
 * Sessions with fewer than 3 real turns are excluded (too short to be meaningful).
 */

import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

// ── Config ───────────────────────────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = `${process.env.HOME}/.claude/projects`;
const MIN_TURNS = 3; // skip sessions shorter than this

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionEntry {
  sessionId: string;
  filePath: string;
  projectLabel: string;
  date: string;              // YYYY-MM-DD of first turn (local time)
  startTime: string;         // ISO timestamp of first turn within range
  endTime: string;           // ISO timestamp of last turn within range
  durationMinutes: number;   // wall-clock minutes between first and last turn in range
  turnCount: number;         // real human↔claude exchanges within range
  fileSizeKb: number;
  firstUserMessage: string;  // first real user message within range
}

// ── Date range parsing ────────────────────────────────────────────────────────

interface DateRange {
  startMs: number;
  endMs: number;
  label: string;
}

function parsePeriod(period: string): DateRange {
  const now = new Date();

  // Helpers
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  const p = period.trim().toLowerCase();

  if (p === "today") {
    const start = startOfDay(now);
    return { startMs: start.getTime(), endMs: now.getTime(), label: "today" };
  }

  if (p === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      startMs: startOfDay(yesterday).getTime(),
      endMs: endOfDay(yesterday).getTime(),
      label: "yesterday",
    };
  }

  if (p === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    startOfDay(start);
    return {
      startMs: startOfDay(start).getTime(),
      endMs: now.getTime(),
      label: "past 7 days",
    };
  }

  // Specific date: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const d = new Date(p + "T00:00:00");
    return {
      startMs: startOfDay(d).getTime(),
      endMs: endOfDay(d).getTime(),
      label: p,
    };
  }

  // Date range: YYYY-MM-DD,YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/.test(p)) {
    const [from, to] = p.split(",");
    return {
      startMs: startOfDay(new Date(from + "T00:00:00")).getTime(),
      endMs: endOfDay(new Date(to + "T00:00:00")).getTime(),
      label: `${from} to ${to}`,
    };
  }

  throw new Error(
    `Unknown period "${period}". Use: today, yesterday, week, YYYY-MM-DD, or YYYY-MM-DD,YYYY-MM-DD`
  );
}

// ── Project label extraction ──────────────────────────────────────────────────

function labelFromProjectDir(dirName: string): string {
  const worktreeMatch = dirName.match(/-worktrees-([0-9a-f]{4})-(.+)/);
  if (worktreeMatch) {
    const parts = worktreeMatch[2].split("-");
    return parts.slice(-2).join("-");
  }
  const parts = dirName.split("-").filter(Boolean);
  const skip = new Set(["Users", "al", "private", "var", "folders", "Documents"]);
  const meaningful = parts.filter((p) => !skip.has(p) && !/^\w{1,2}$/.test(p));
  return meaningful.length > 0 ? meaningful.slice(-2).join("-") : parts.slice(-2).join("-");
}

// ── Text extraction from message content ─────────────────────────────────────

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => (b.text as string).trim())
      .join(" ")
      .trim();
  }
  return "";
}

// Noise patterns to skip when looking for the first real user message
const SKIP_USER_MESSAGE = [
  /^</,                              // XML tags (system injections)
  /^Base directory for this skill:/,
  /^!\[/,                            // image references
];

function isNoise(text: string): boolean {
  return SKIP_USER_MESSAGE.some((re) => re.test(text));
}

// ── Parse a single session file ───────────────────────────────────────────────

async function indexSession(
  filePath: string,
  projectLabel: string,
  range: DateRange
): Promise<SessionEntry | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = raw.split("\n").filter(Boolean);

  let firstUserMessage = "";
  let firstTimestamp = "";
  let lastTimestamp = "";
  let sessionId = "";
  let turnCount = 0;

  for (const line of lines) {
    let record: Record<string, unknown>;
    try { record = JSON.parse(line); } catch { continue; }

    if (!sessionId && typeof record.sessionId === "string") {
      sessionId = record.sessionId;
    }

    if (record.type !== "user" && record.type !== "assistant") continue;
    if (record.isSidechain === true) continue;

    const ts = typeof record.timestamp === "string" ? record.timestamp : "";
    if (!ts) continue;

    const msgTime = new Date(ts).getTime();

    // Must fall within range
    if (msgTime < range.startMs || msgTime > range.endMs) continue;

    const message = record.message as Record<string, unknown> | undefined;
    if (!message) continue;

    const role = message.role as string;
    if (role !== "user" && role !== "assistant") continue;

    const text = extractText(message.content);
    if (!text || text.length < 5) continue;

    // Track first and last timestamps within range
    if (!firstTimestamp) firstTimestamp = ts;
    lastTimestamp = ts;

    turnCount++;

    // Capture first real user message
    if (role === "user" && !firstUserMessage && !isNoise(text) && text.length > 10) {
      firstUserMessage = text;
    }
  }

  if (!firstTimestamp || turnCount < MIN_TURNS || !firstUserMessage) return null;

  const fileStat = await stat(filePath).catch(() => null);
  const fileSizeKb = fileStat ? Math.round(fileStat.size / 1024) : 0;

  const durationMinutes = lastTimestamp
    ? Math.round((new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()) / 60000)
    : 0;

  return {
    sessionId,
    filePath,
    projectLabel,
    date: new Date(firstTimestamp).toLocaleDateString("en-CA"), // en-CA gives YYYY-MM-DD in local time
    startTime: firstTimestamp,
    endTime: lastTimestamp,
    durationMinutes,
    turnCount,
    fileSizeKb,
    firstUserMessage,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Parse --period argument
  const args = process.argv.slice(2);
  let period = "today";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--period" && args[i + 1]) {
      period = args[++i];
    }
  }

  let range: DateRange;
  try {
    range = parsePeriod(period);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }

  console.error(`Indexing sessions for: ${range.label}`);

  // Scan all project directories
  let projectDirs: string[];
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS_DIR);
  } catch {
    console.error(`Could not read ${CLAUDE_PROJECTS_DIR}`);
    process.exit(1);
  }

  const entries: SessionEntry[] = [];

  for (const projectDir of projectDirs) {
    const projectPath = join(CLAUDE_PROJECTS_DIR, projectDir);
    const label = labelFromProjectDir(projectDir);

    let files: string[];
    try { files = await readdir(projectPath); } catch { continue; }

    const sessionFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const sessionFile of sessionFiles) {
      const filePath = join(projectPath, sessionFile);

      // Quick mtime check — skip files not touched in the range window
      // (add a 1-day buffer on start to catch sessions that started before range)
      try {
        const s = await stat(filePath);
        if (s.mtimeMs < range.startMs - 86400000) continue;
      } catch { continue; }

      const entry = await indexSession(filePath, label, range);
      if (entry) entries.push(entry);
    }
  }

  // Sort oldest → newest
  entries.sort((a, b) => a.startTime.localeCompare(b.startTime));

  console.error(`Found ${entries.length} session(s).`);
  process.stdout.write(JSON.stringify(entries, null, 2));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
