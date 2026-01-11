import { NextResponse } from "next/server";
import { getOrCreateConfig } from "../../../../lib/config_store";
import { pool } from "../../../../lib/db";
import { getAutomationState } from "../../../../lib/stores/automation_state_store";
import { readFloatEnv, readIntEnv } from "../../../../lib/utils/env";

export const runtime = "nodejs";

type JobLockRow = {
	locked_by: string | null;
	expires_at: string | null;
};

type JobRunMeta = {
	rates?: { fail_rate?: number; fallback_rate?: number };
	stats?: { total?: number; failed?: number; fetch_fallback?: number };
};

function readIso(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const ts = Date.parse(value);
	return Number.isNaN(ts) ? null : value;
}

function extractRates(meta: JobRunMeta | null): {
	fail_rate: number | null;
	fallback_rate: number | null;
} {
	if (!meta) return { fail_rate: null, fallback_rate: null };
	if (meta.rates) {
		const fail = typeof meta.rates.fail_rate === "number" ? meta.rates.fail_rate : null;
		const fallback =
			typeof meta.rates.fallback_rate === "number"
				? meta.rates.fallback_rate
				: null;
		return { fail_rate: fail, fallback_rate: fallback };
	}
	if (meta.stats) {
		const total = meta.stats.total ?? 0;
		if (total <= 0) return { fail_rate: 0, fallback_rate: 0 };
		const fail = (meta.stats.failed ?? 0) / total;
		const fallback = (meta.stats.fetch_fallback ?? 0) / total;
		return { fail_rate: fail, fallback_rate: fallback };
	}
	return { fail_rate: null, fallback_rate: null };
}

export async function GET() {
	try {
		const config = await getOrCreateConfig();
		const state = await getAutomationState();
		const stateValue = state?.value ?? {};
		const lastCronHitAt = readIso(stateValue.last_cron_hit_at);
		const lastJobStartedAt = readIso(stateValue.last_job_started_at);

		const lockRes = await pool.query<JobLockRow>(
			`
			SELECT locked_by, expires_at
			FROM job_locks
			WHERE lock_name = $1
		`,
			["pull_now"],
		);
		const lockRow = lockRes.rows[0] ?? { locked_by: null, expires_at: null };
		const lockExpiresAt = readIso(lockRow.expires_at);
		const lockActive =
			lockExpiresAt !== null && Date.parse(lockExpiresAt) > Date.now();

		const lookbackRuns = Math.max(
			1,
			readIntEnv("WATCHDOG_LOOKBACK_RUNS", 5),
		);
		const jobRuns = await pool.query<{ meta: JobRunMeta | null }>(
			`
			SELECT meta
			FROM job_runs
			ORDER BY started_at DESC, id DESC
			LIMIT $1
		`,
			[lookbackRuns],
		);

		let sumFail = 0;
		let sumFallback = 0;
		let rateCount = 0;
		for (const row of jobRuns.rows) {
			const { fail_rate, fallback_rate } = extractRates(row.meta);
			if (fail_rate === null || fallback_rate === null) continue;
			sumFail += fail_rate;
			sumFallback += fallback_rate;
			rateCount += 1;
		}

		const avgFailRate = rateCount > 0 ? sumFail / rateCount : 0;
		const avgFallbackRate = rateCount > 0 ? sumFallback / rateCount : 0;

		const staleMultiplier = readFloatEnv("WATCHDOG_STALE_MULTIPLIER", 2);
		const failWarn = readFloatEnv("WATCHDOG_FAIL_RATE_WARN", 0.3);
		const failBad = readFloatEnv("WATCHDOG_FAIL_RATE_BAD", 0.6);
		const fallbackWarn = readFloatEnv("WATCHDOG_FALLBACK_RATE_WARN", 0.5);

		const reasons: string[] = [];
		let health: "healthy" | "warning" | "bad" | "stale" | "disabled" | "running" =
			"healthy";

		if (!config.schedule_enabled) {
			health = "disabled";
		} else if (lockActive) {
			health = "running";
		} else {
			const intervalMinutes = config.schedule_interval_minutes ?? 60;
			const staleMs = intervalMinutes * staleMultiplier * 60_000;
			const lastJobTs = lastJobStartedAt ? Date.parse(lastJobStartedAt) : NaN;
			if (!Number.isFinite(lastJobTs) || Date.now() - lastJobTs > staleMs) {
				health = "stale";
				reasons.push("STALE_NO_RECENT_JOB");
			} else {
				if (avgFailRate >= failBad) {
					health = "bad";
					reasons.push("FAIL_RATE_HIGH");
				} else if (avgFailRate >= failWarn) {
					health = "warning";
					reasons.push("FAIL_RATE_HIGH");
				}

				if (avgFallbackRate >= fallbackWarn) {
					if (health === "healthy") health = "warning";
					reasons.push("FALLBACK_RATE_HIGH");
				}
			}
		}

		return NextResponse.json({
			schedule_enabled: config.schedule_enabled,
			interval_minutes: config.schedule_interval_minutes,
			last_cron_hit_at: lastCronHitAt,
			last_job_started_at: lastJobStartedAt,
			lock: {
				is_locked: lockActive,
				expires_at: lockExpiresAt,
				locked_by: lockRow.locked_by ?? null,
			},
			health,
			reasons,
			recent: {
				lookback_runs: lookbackRuns,
				avg_fail_rate: avgFailRate,
				avg_fallback_rate: avgFallbackRate,
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
