/**
 * Background worker that rewrites long "first-prompt" session titles into short
 * ones using a local Ollama model, then broadcasts a live sidebar update.
 *
 * Opt-in and default-off (needs a local Ollama): a no-op unless
 * CLOUDCLI_AI_TITLES_ENABLED=true. Runs a single, sequential drip so a full
 * backfill stays gentle and never overlaps itself. Eligibility (which rows are
 * "raw" and long enough) is decided in SQL by sessionsDb.getSessionsNeedingAiTitle.
 */

import { sessionsDb } from '@/modules/database/index.js';
import { generateShortTitle } from '@/modules/providers/services/ai-title-generator.service.js';
import { broadcastSessionUpserted } from '@/modules/providers/services/sessions-watcher.service.js';

interface TitlerConfig {
  enabled: boolean;
  ollamaUrl: string;
  model: string;
  intervalMs: number;
  batchSize: number;
  minLength: number;
}

function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readConfig(): TitlerConfig {
  return {
    enabled: process.env.CLOUDCLI_AI_TITLES_ENABLED === 'true',
    ollamaUrl: process.env.CLOUDCLI_AI_TITLES_OLLAMA_URL?.trim() || 'http://localhost:11434',
    model: process.env.CLOUDCLI_AI_TITLES_MODEL?.trim() || 'llama3.1:8b',
    intervalMs: positiveIntFromEnv(process.env.CLOUDCLI_AI_TITLES_INTERVAL_MS, 5_000),
    batchSize: positiveIntFromEnv(process.env.CLOUDCLI_AI_TITLES_BATCH, 5),
    minLength: positiveIntFromEnv(process.env.CLOUDCLI_AI_TITLES_MIN_LEN, 60),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
let consecutiveFailures = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Processes one batch: for each eligible row, generate a short title and persist
 * it as `name_source = 'ai'`. Every attempted row is marked done (even when the
 * model yields nothing usable, in which case the original title is kept) so a
 * stubborn row can never starve the backfill by being re-picked every tick. A
 * thrown request means Ollama is unhealthy: log once, abort the batch, retry next tick.
 */
async function runTick(config: TitlerConfig): Promise<void> {
  if (tickInFlight) {
    return;
  }
  tickInFlight = true;

  try {
    const rows = sessionsDb.getSessionsNeedingAiTitle(config.minLength, config.batchSize);
    let rewritten = 0;

    for (const row of rows) {
      const raw = row.custom_name;
      if (!raw) {
        continue;
      }

      let title: string | null;
      try {
        title = await generateShortTitle(raw, { ollamaUrl: config.ollamaUrl, model: config.model });
      } catch (error) {
        if (consecutiveFailures === 0) {
          console.warn(`[AI titles] Ollama request failed, backing off: ${errorMessage(error)}`);
        }
        consecutiveFailures += 1;
        return;
      }

      if (consecutiveFailures > 0) {
        console.log('[AI titles] Ollama reachable again, resuming.');
        consecutiveFailures = 0;
      }

      const finalTitle = title && title !== raw ? title : raw;
      sessionsDb.updateSessionCustomName(row.session_id, finalTitle, 'ai');

      if (finalTitle !== raw) {
        await broadcastSessionUpserted(row.session_id);
        rewritten += 1;
      }
    }

    if (rewritten > 0) {
      console.log(`[AI titles] Rewrote ${rewritten} session title(s).`);
    }
  } catch (error) {
    console.error(`[AI titles] Tick failed: ${errorMessage(error)}`);
  } finally {
    tickInFlight = false;
  }
}

/**
 * Starts the periodic titler. No-op (with one info log) when disabled or when
 * already running. The interval is unref'd so it never blocks shutdown.
 */
export function startAiSessionTitler(): void {
  const config = readConfig();

  if (!config.enabled) {
    console.log('[AI titles] Disabled (set CLOUDCLI_AI_TITLES_ENABLED=true to enable).');
    return;
  }
  if (timer) {
    return;
  }

  console.log(
    `[AI titles] Enabled — model=${config.model}, url=${config.ollamaUrl}, ` +
      `every ${config.intervalMs}ms, batch ${config.batchSize}, min length ${config.minLength}.`
  );

  timer = setInterval(() => {
    void runTick(config);
  }, config.intervalMs);
  timer.unref?.();
}

/**
 * Stops the periodic titler. Safe to call when it was never started.
 */
export function stopAiSessionTitler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
