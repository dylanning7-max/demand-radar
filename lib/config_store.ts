import crypto from "node:crypto";
import { pool } from "./db";

export type AppConfigRow = {
	id: number;
	schedule_enabled: boolean;
	schedule_interval_minutes: number;
	max_content_chars: number;
	max_per_run: number;
	include_comments: boolean;
	comment_max_items: number;
	cron_secret: string;
	updated_at: string;
};

function generateCronSecret(): string {
	return crypto.randomBytes(24).toString("base64url");
}

export async function getOrCreateConfig(): Promise<AppConfigRow> {
	const existing = await pool.query<AppConfigRow>(
		"SELECT * FROM app_config WHERE id = 1",
	);
	if (existing.rows[0]) return existing.rows[0];

	const cronSecret = generateCronSecret();
	const inserted = await pool.query<AppConfigRow>(
		"INSERT INTO app_config (id, cron_secret) VALUES (1, $1) RETURNING *",
		[cronSecret],
	);
	return inserted.rows[0];
}
