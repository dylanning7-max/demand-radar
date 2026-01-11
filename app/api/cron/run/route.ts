import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getOrCreateConfig } from "../../../../lib/config_store";
import { runJob } from "../../../../lib/job_runner";
import { acquireLock, releaseLock } from "../../../../lib/jobs/lock";
import { updateAutomationState } from "../../../../lib/stores/automation_state_store";
import { readIntEnv } from "../../../../lib/utils/env";

export const runtime = "nodejs";

async function handleCron(req: Request) {
	const owner = `cron-${crypto.randomUUID()}`;
	const ttlMs = readIntEnv("JOB_LOCK_TTL_MS", 180_000);
	const nowIso = new Date().toISOString();
	try {
		const config = await getOrCreateConfig();
		const provided = req.headers.get("x-cron-secret");
		if (!provided || provided !== config.cron_secret) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		await updateAutomationState({ last_cron_hit_at: nowIso });
		if (!config.schedule_enabled) {
			return NextResponse.json({ skipped: true, reason: "SCHEDULE_DISABLED" });
		}
		const lock = await acquireLock("pull_now", owner, ttlMs);
		if (!lock.acquired) {
			return NextResponse.json({ skipped: true, reason: "LOCKED", lock: lock.lock });
		}
		await updateAutomationState({
			last_job_started_at: nowIso,
			last_trigger: "cron",
		});
		const jobRun = await runJob("pull_demands", "cron");
		return NextResponse.json(jobRun);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	} finally {
		await releaseLock("pull_now", owner);
	}
}

export async function POST(req: Request) {
	return handleCron(req);
}

export async function GET(req: Request) {
	return handleCron(req);
}
