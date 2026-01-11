import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
	try {
		const res = await pool.query(
			"SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 1",
		);
		return NextResponse.json(res.rows[0] ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

