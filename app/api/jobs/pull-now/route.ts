import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { runJob } from "../../../../lib/job_runner";
import { acquireLock, releaseLock } from "../../../../lib/jobs/lock";
import { updateAutomationState } from "../../../../lib/stores/automation_state_store";
import { readIntEnv } from "../../../../lib/utils/env";

export const runtime = "nodejs";

export async function POST() {
	const owner = `manual-${crypto.randomUUID()}`;
	const ttlMs = readIntEnv("JOB_LOCK_TTL_MS", 180_000);
	const startedAt = new Date().toISOString();

	try {
		const lock = await acquireLock("pull_now", owner, ttlMs);
		if (!lock.acquired) {
			return NextResponse.json({ skipped: true, reason: "LOCKED", lock: lock.lock });
		}

		await updateAutomationState({
			last_job_started_at: startedAt,
			last_trigger: "manual",
		});

		const jobRun = await runJob("pull_demands", "manual");
		return NextResponse.json(jobRun);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	} finally {
		await releaseLock("pull_now", owner);
	}
}
