import { stat } from 'node:fs/promises';

import { resolveClaudeJsonlPath } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import type { AnyRecord } from '@/shared/types.js';
import { readFileTail } from '@/shared/utils.js';

/**
 * Server-derived "what is this session doing right now" status for sessions
 * cloudcli did not launch (#21).
 *
 * A bare-terminal `claude` writes the same `~/.claude/projects/*.jsonl` files as
 * cloudcli, so it appears in the unified Conversations list — but cloudcli has
 * no live run for it and would always rank it idle. This module recovers a live
 * status straight from the transcript on disk (mtime recency + last-event
 * inspection) so those sessions rank alongside cloudcli-driven ones. Herdr-style
 * order: blocked > working > idle.
 */
export type SessionLiveStatus = 'blocked' | 'working' | 'idle';

// A transcript touched within this window is treated as an agent that is
// actively writing (streaming assistant text / a rapid tool loop). Kept short so
// a finished turn decays to idle quickly, yet long enough to tolerate the brief
// gaps between successive tool calls without the status flapping.
const WORKING_WINDOW_MS = 15_000;

// An assistant turn that ends on an unanswered tool_use is either parked on a
// permission / plan-approval prompt or running a slow tool; either way it still
// "needs me" for up to this long. Beyond it we assume the terminal session was
// abandoned (closed without answering) and let it fall back to idle history.
const AWAITING_INPUT_WINDOW_MS = 5 * 60_000;

// Initial bytes read from the end of the transcript. A handful of ordinary
// JSONL events fit easily. The final event can be far larger than this, though
// — a big `Write`/`Edit` tool_use embeds the whole file body — so when the
// slice lands entirely inside one oversized last line and parses nothing,
// resolveSessionLiveStatus grows the window (below) rather than miss a
// permission-pending large write.
const LIVE_STATUS_TAIL_BYTES = 128 * 1024;

// Upper bound on the grow-the-window retry. A pathological final event (writing
// a multi-MB file) beyond this is left unclassified rather than slurped whole on
// every projects fetch — an acceptable miss for an extreme edge versus the cost
// of reading megabytes per session.
const LIVE_STATUS_MAX_TAIL_BYTES = 4 * 1024 * 1024;

/** Parses the JSONL tail, skipping blank and (often truncated) unparseable lines. */
function parseTailEvents(tail: string): AnyRecord[] {
  const events: AnyRecord[] = [];
  for (const line of tail.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      events.push(JSON.parse(trimmed) as AnyRecord);
    } catch {
      // The first slice line is frequently cut mid-record; ignore bad lines.
    }
  }
  return events;
}

/**
 * True when the transcript's final assistant turn ends on a `tool_use` that has
 * no matching `tool_result` yet — the on-disk proxy for "awaiting the user".
 *
 * Claude does not persist permission / plan-approval prompts to the JSONL (those
 * are live SDK-only events), so an unanswered tool_use is the best available
 * signal that the agent is parked waiting on input rather than still producing
 * output. Plan mode's `ExitPlanMode` is itself a tool_use, so it is covered too.
 */
function eventsEndAwaitingUserInput(events: AnyRecord[]): boolean {
  if (events.length === 0) {
    return false;
  }

  // Every tool_result anywhere in the tail resolves its originating tool_use.
  const resolvedToolUseIds = new Set<string>();
  for (const event of events) {
    const content = event.message?.role === 'user' ? event.message?.content : null;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content as AnyRecord[]) {
      if (part?.type === 'tool_result' && typeof part.tool_use_id === 'string') {
        resolvedToolUseIds.add(part.tool_use_id);
      }
    }
  }

  // Inspect the most recent assistant message: an unanswered tool_use means the
  // turn is parked waiting on the user.
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.message?.role !== 'assistant') {
      continue;
    }

    const content = event.message?.content;
    if (!Array.isArray(content)) {
      return false;
    }

    for (const part of content as AnyRecord[]) {
      if (part?.type === 'tool_use' && typeof part.id === 'string' && !resolvedToolUseIds.has(part.id)) {
        return true;
      }
    }

    // The latest assistant turn resolved (or never issued) its tools → not waiting.
    return false;
  }

  return false;
}

function classifyFromEvents(events: AnyRecord[], mtimeMs: number, nowMs: number): SessionLiveStatus {
  const ageMs = nowMs - mtimeMs;

  // Awaiting user input (permission / plan approval / a parked tool) needs
  // attention and outranks everything else while it is still recent enough.
  if (ageMs <= AWAITING_INPUT_WINDOW_MS && eventsEndAwaitingUserInput(events)) {
    return 'blocked';
  }

  // Actively producing output.
  if (ageMs <= WORKING_WINDOW_MS) {
    return 'working';
  }

  // Old history, or a stale/abandoned awaiting-input turn.
  return 'idle';
}

/**
 * Pure classifier: maps a transcript tail plus its mtime to a live status.
 *
 * Exported for unit testing so crafted tails / mtimes can be asserted without
 * touching disk.
 */
export function classifyClaudeLiveStatus(tail: string, mtimeMs: number, nowMs: number): SessionLiveStatus {
  return classifyFromEvents(parseTailEvents(tail), mtimeMs, nowMs);
}

/**
 * Fields needed to locate and classify a session's transcript. Mirrors the
 * columns the sessions DB already stores per row.
 */
export type LiveStatusSource = {
  provider: string;
  sessionId: string;
  jsonlPath: string | null;
  projectPath: string | null;
};

/**
 * Resolves a session's transcript on disk and returns its live status.
 *
 * Best-effort by design: any failure (missing file, unreadable path, unknown
 * provider) yields `'idle'` so a projects/sessions response is never failed over
 * live-status detection. Only Claude transcripts are inspected today; other
 * providers keep `'idle'` rather than risk misreading a different on-disk format.
 */
export async function resolveSessionLiveStatus(
  source: LiveStatusSource,
  nowMs: number = Date.now(),
): Promise<SessionLiveStatus> {
  if (source.provider !== 'claude') {
    return 'idle';
  }

  try {
    const jsonlPath = await resolveClaudeJsonlPath(source.jsonlPath, source.sessionId, source.projectPath);
    if (!jsonlPath) {
      return 'idle';
    }

    const { mtimeMs, size } = await stat(jsonlPath);
    // Fast path: an old transcript is idle history — skip the tail read.
    if (nowMs - mtimeMs > AWAITING_INPUT_WINDOW_MS) {
      return 'idle';
    }

    // Read the transcript tail, growing the window if the slice fell entirely
    // inside one oversized final event (a large Write/Edit tool_use) and parsed
    // nothing — otherwise a permission-pending large write would be missed and
    // never ranked blocked. Bounded by the file size and a hard cap.
    let windowBytes = LIVE_STATUS_TAIL_BYTES;
    let events = parseTailEvents(await readFileTail(jsonlPath, windowBytes));
    while (events.length === 0 && windowBytes < size && windowBytes < LIVE_STATUS_MAX_TAIL_BYTES) {
      windowBytes = Math.min(windowBytes * 4, LIVE_STATUS_MAX_TAIL_BYTES);
      events = parseTailEvents(await readFileTail(jsonlPath, windowBytes));
    }
    return classifyFromEvents(events, mtimeMs, nowMs);
  } catch {
    return 'idle';
  }
}
