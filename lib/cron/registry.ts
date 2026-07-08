import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { getMarketStatus } from "@/lib/market-status";

// Scheduler-agnostic cron: ONE dispatcher (/api/cron/tick) called by any external
// trigger (Vercel cron, GitHub Actions, cron-job.org…) on a short interval. Each
// job declares its own cadence + market-hours gating; on every tick the
// dispatcher runs whatever is due. This decouples cadence from the trigger, so a
// daily Vercel Hobby cron OR a 5-min external ping both give each job its correct
// rhythm (jobs simply run less often on a slower trigger).
//
// Last-run + a short lock are kept in server_cache so overlapping ticks (or two
// serverless instances) can't double-run a job.

export interface CronJob {
  id: string;
  // Minimum minutes between runs. The dispatcher runs the job when
  // (now - lastRun) >= everyMinutes AND (marketHoursOnly ? market is open : true).
  everyMinutes: number;
  marketHoursOnly?: boolean;
  run: () => Promise<{ ok: boolean; note?: string }>;
}

export interface JobResult { id: string; ran: boolean; ok?: boolean; skipped?: string; note?: string; ms?: number }

const LAST_RUN_KEY = (id: string) => `cron:lastrun:${id}`;
const LOCK_KEY = (id: string) => `cron:lock:${id}`;
const LOCK_TTL_MS = 10 * 60 * 1000; // a job that hasn't cleared its lock in 10m is presumed dead

async function lastRunAt(id: string): Promise<number> {
  const { value } = await readServerCache<{ at: number }>(LAST_RUN_KEY(id), Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  return value?.at ?? 0;
}
async function setLastRun(id: string, at: number): Promise<void> {
  await writeServerCache(LAST_RUN_KEY(id), { at }).catch(() => {});
}

// Best-effort lock: returns true if we acquired it. Not perfectly atomic (no
// SELECT…FOR UPDATE via PostgREST), but the read-then-write window is tiny and
// double-running a cache-rebuild is harmless — this just avoids the common case.
async function acquireLock(id: string, now: number): Promise<boolean> {
  const { value } = await readServerCache<{ until: number }>(LOCK_KEY(id), Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  if (value && typeof value.until === "number" && now < value.until) return false;
  await writeServerCache(LOCK_KEY(id), { until: now + LOCK_TTL_MS }).catch(() => {});
  return true;
}
async function releaseLock(id: string): Promise<void> {
  await writeServerCache(LOCK_KEY(id), { until: 0 }).catch(() => {});
}

// Run all jobs that are due. `nowMs` injectable for tests.
export async function runDueJobs(jobs: CronJob[], nowMs = Date.now()): Promise<JobResult[]> {
  const results: JobResult[] = [];
  const marketOpen = getMarketStatus(new Date(nowMs)).phase === "open";

  for (const job of jobs) {
    if (job.marketHoursOnly && !marketOpen) { results.push({ id: job.id, ran: false, skipped: "market closed" }); continue; }
    const last = await lastRunAt(job.id);
    if (nowMs - last < job.everyMinutes * 60_000) { results.push({ id: job.id, ran: false, skipped: "not due" }); continue; }
    if (!(await acquireLock(job.id, nowMs))) { results.push({ id: job.id, ran: false, skipped: "locked" }); continue; }

    const t0 = Date.now();
    try {
      const r = await job.run();
      await setLastRun(job.id, nowMs);
      results.push({ id: job.id, ran: true, ok: r.ok, note: r.note, ms: Date.now() - t0 });
    } catch (e) {
      // Still stamp lastRun so a persistently-failing job doesn't run every tick.
      await setLastRun(job.id, nowMs);
      results.push({ id: job.id, ran: true, ok: false, note: e instanceof Error ? e.message : "job error", ms: Date.now() - t0 });
    } finally {
      await releaseLock(job.id);
    }
  }
  return results;
}
