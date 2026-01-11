import { pool } from "./db";

export type UrlAnalysisUpsertInput = {
	url: string;
	url_normalized: string;
	source_id?: string | null;
	status: "success" | "failed";
	step: "fetched" | "extracted" | "analyzed";
	extractor_used: "readability" | "jina" | "hn_discussion_api";
	extracted_len: number;
	fail_reason: string | null;
	content_text: string | null;
	need_card_json: unknown | null;
	error: string | null;
	warnings: unknown[];
	meta: Record<string, unknown>;
	low_confidence: boolean;
};

export async function upsertUrlAnalysis(input: UrlAnalysisUpsertInput) {
	const warningsJson = safeJson(input.warnings, []);
	const metaJson = safeJson(input.meta, {});
	const query = `
		INSERT INTO url_analyses (
			id,
			url,
			url_normalized,
			source_id,
			status,
			step,
			extractor_used,
			extracted_len,
			fail_reason,
			content_text,
			need_card_json,
			warnings,
			meta,
			low_confidence,
			error,
			created_at,
			updated_at
		)
		VALUES (
			gen_random_uuid(),
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11::jsonb,
			$12::jsonb,
			$13,
			$14,
			now(),
			now()
		)
		ON CONFLICT (url_normalized) DO UPDATE SET
			url = EXCLUDED.url,
			source_id = EXCLUDED.source_id,
			status = EXCLUDED.status,
			step = EXCLUDED.step,
			extractor_used = EXCLUDED.extractor_used,
			extracted_len = EXCLUDED.extracted_len,
			fail_reason = EXCLUDED.fail_reason,
			content_text = EXCLUDED.content_text,
			need_card_json = EXCLUDED.need_card_json,
			warnings = EXCLUDED.warnings,
			meta = EXCLUDED.meta,
			low_confidence = EXCLUDED.low_confidence,
			error = EXCLUDED.error,
			updated_at = now()
		RETURNING *;
	`;

	const res = await pool.query(query, [
		input.url,
		input.url_normalized,
		input.source_id ?? null,
		input.status,
		input.step,
		input.extractor_used,
		input.extracted_len,
		input.fail_reason,
		input.content_text,
		input.need_card_json,
		warningsJson,
		metaJson,
		input.low_confidence,
		input.error,
	]);
	return res.rows[0];
}

function safeJson(value: unknown, fallback: unknown): string {
	try {
		return JSON.stringify(value ?? fallback);
	} catch {
		return JSON.stringify(fallback);
	}
}
