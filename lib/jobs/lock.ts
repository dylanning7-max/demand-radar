import { pool } from "../db";

export type JobLockRow = {
	lock_name: string;
	locked_by: string | null;
	locked_at: string | null;
	expires_at: string | null;
};

export type AcquireResult = {
	acquired: boolean;
	lock?: JobLockRow | null;
	reason?: "LOCKED";
};

export async function acquireLock(
	lockName: string,
	owner: string,
	ttlMs: number,
): Promise<AcquireResult> {
	const res = await pool.query<JobLockRow>(
		`
		UPDATE job_locks
		SET locked_by = $2,
			locked_at = now(),
			expires_at = now() + ($3 || ' milliseconds')::interval
		WHERE lock_name = $1
			AND (expires_at IS NULL OR expires_at <= now())
		RETURNING lock_name, locked_by, locked_at, expires_at;
	`,
		[lockName, owner, Math.max(1, ttlMs)],
	);

	if (res.rows[0]) {
		return { acquired: true, lock: res.rows[0] };
	}

	const current = await pool.query<JobLockRow>(
		`
		SELECT lock_name, locked_by, locked_at, expires_at
		FROM job_locks
		WHERE lock_name = $1
	`,
		[lockName],
	);

	return {
		acquired: false,
		reason: "LOCKED",
		lock: current.rows[0] ?? null,
	};
}

export async function releaseLock(lockName: string, owner: string): Promise<void> {
	await pool.query(
		`
		UPDATE job_locks
		SET locked_by = NULL, locked_at = NULL, expires_at = NULL
		WHERE lock_name = $1 AND locked_by = $2
	`,
		[lockName, owner],
	);
}

export async function forceUnlock(lockName: string): Promise<void> {
	await pool.query(
		`
		UPDATE job_locks
		SET locked_by = NULL, locked_at = NULL, expires_at = NULL
		WHERE lock_name = $1
	`,
		[lockName],
	);
}
