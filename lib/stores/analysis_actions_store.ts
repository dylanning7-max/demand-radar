import { pool } from "../db";

export type AnalysisActionRow = {
	analysis_id: string;
	action: "saved" | "ignored" | "watching";
	tags: string[];
	note: string | null;
	updated_at: string;
};

export async function upsertAnalysisAction(input: {
	analysis_id: string;
	action: "saved" | "ignored" | "watching";
	tags: string[];
	note: string | null;
}): Promise<AnalysisActionRow> {
	const res = await pool.query<AnalysisActionRow>(
		`
		INSERT INTO analysis_actions (
			analysis_id,
			action,
			tags,
			note
		)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (analysis_id) DO UPDATE SET
			action = EXCLUDED.action,
			tags = EXCLUDED.tags,
			note = EXCLUDED.note,
			updated_at = now()
		RETURNING analysis_id, action, tags, note, updated_at;
	`,
		[input.analysis_id, input.action, input.tags, input.note],
	);
	return res.rows[0];
}

export async function deleteAnalysisAction(
	analysisId: string,
): Promise<{ analysis_id: string } | null> {
	const res = await pool.query<{ analysis_id: string }>(
		"DELETE FROM analysis_actions WHERE analysis_id = $1 RETURNING analysis_id",
		[analysisId],
	);
	return res.rows[0] ?? null;
}

export type SavedAnalysisRow = {
	id: string;
	updated_at: string;
	url_normalized: string;
	status: "success" | "failed";
	need_card_json: Record<string, unknown> | null;
	meta: Record<string, unknown> | null;
	action: "saved" | "watching";
	tags: string[];
	note: string | null;
	action_updated_at: string;
};

export async function listSavedAnalyses(tag?: string): Promise<SavedAnalysisRow[]> {
	const params: Array<string | string[]> = [];
	let where = "aa.action IN ('saved', 'watching')";
	if (tag) {
		params.push(tag);
		where += " AND aa.tags @> ARRAY[$1]::text[]";
	}
	const res = await pool.query<SavedAnalysisRow>(
		`
		SELECT
			a.id,
			a.updated_at,
			a.url_normalized,
			a.status,
			a.need_card_json,
			a.meta,
			aa.action,
			aa.tags,
			aa.note,
			aa.updated_at AS action_updated_at
		FROM url_analyses a
		INNER JOIN analysis_actions aa ON aa.analysis_id = a.id
		WHERE ${where}
		ORDER BY aa.updated_at DESC
	`,
		params,
	);
	return res.rows;
}
