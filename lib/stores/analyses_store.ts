import { pool } from "../db";

export type AnalysisListRow = {
	id: string;
	updated_at: string;
	url_normalized: string;
	status: "success" | "failed";
	low_confidence: boolean | null;
	need_kind: string | null;
	need_title: string | null;
	need_wtp: string | null;
	need_pain: string | null;
	hn_target_url: string | null;
	source_label: string | null;
	action: string | null;
	tags: string[] | null;
	note: string | null;
	action_updated_at: string | null;
};

export async function listAnalyses(input: {
	limit: number;
	offset: number;
	showIgnored: boolean;
}): Promise<AnalysisListRow[]> {
	const res = await pool.query<AnalysisListRow>(
		`
		SELECT
			a.id,
			a.updated_at,
			a.url_normalized,
			a.status,
			a.low_confidence,
			a.need_card_json->>'kind' AS need_kind,
			a.need_card_json->>'title' AS need_title,
			a.need_card_json->>'wtp_signal' AS need_wtp,
			a.need_card_json->>'pain' AS need_pain,
			a.meta->'hn'->>'target_url' AS hn_target_url,
			s.name AS source_label,
			aa.action,
			aa.tags,
			aa.note,
			aa.updated_at AS action_updated_at
		FROM url_analyses a
		LEFT JOIN sources s ON a.source_id = s.id
		LEFT JOIN analysis_actions aa ON aa.analysis_id = a.id
		WHERE ($3::boolean = true OR aa.action IS DISTINCT FROM 'ignored')
		ORDER BY a.updated_at DESC, a.id DESC
		LIMIT $1 OFFSET $2
	`,
		[input.limit, input.offset, input.showIgnored],
	);
	return res.rows;
}

export async function getAnalysisById(
	id: string,
): Promise<Record<string, unknown> | null> {
	const res = await pool.query<Record<string, unknown>>(
		`
		SELECT
			a.*,
			aa.action,
			aa.tags,
			aa.note,
			aa.updated_at AS action_updated_at
		FROM url_analyses a
		LEFT JOIN analysis_actions aa ON aa.analysis_id = a.id
		WHERE a.id = $1
	`,
		[id],
	);
	return res.rows[0] ?? null;
}
