import { pool } from "../db";

export type JobRunListRow = {
	id: string;
	started_at: string;
	finished_at: string | null;
	trigger: "manual" | "cron";
	status: "success" | "failed";
	error: string | null;
	log: string | null;
	meta: Record<string, unknown> | null;
};

export async function listJobRuns(input: {
	limit: number;
	offset: number;
}): Promise<JobRunListRow[]> {
	const res = await pool.query<JobRunListRow>(
		`
		SELECT id, started_at, finished_at, trigger, status, error, log, meta
		FROM job_runs
		ORDER BY started_at DESC, id DESC
		LIMIT $1 OFFSET $2
	`,
		[input.limit, input.offset],
	);
	return res.rows;
}
