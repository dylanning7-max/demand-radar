import { pool } from "../db";
import { SourceRow } from "../adapters/base";

export async function listEnabledSources(): Promise<SourceRow[]> {
	const res = await pool.query<SourceRow>(
		`
		SELECT id, name, type, entry_url, enabled, discover_limit, analyze_top_n
		FROM sources
		WHERE enabled = true
		ORDER BY updated_at DESC
	`,
	);
	return res.rows;
}

export async function touchSourceCheckedAt(sourceId: string): Promise<void> {
	await pool.query(
		"UPDATE sources SET last_checked_at = now(), updated_at = now() WHERE id = $1",
		[sourceId],
	);
}

