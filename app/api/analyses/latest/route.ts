import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
	try {
		const res = await pool.query(
			`
			SELECT
				a.*,
				aa.action,
				aa.tags,
				aa.note,
				aa.updated_at AS action_updated_at
			FROM url_analyses a
			LEFT JOIN analysis_actions aa ON aa.analysis_id = a.id
			WHERE aa.action IS DISTINCT FROM 'ignored'
			ORDER BY a.updated_at DESC
			LIMIT 1
		`,
		);
		return NextResponse.json(res.rows[0] ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
