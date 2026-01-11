import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../lib/db";
import { getOrCreateConfig } from "../../../lib/config_store";

export const runtime = "nodejs";

const ConfigSchema = z.object({
	schedule_enabled: z.boolean(),
	schedule_interval_minutes: z.number().int().min(5).max(10080),
	max_content_chars: z.number().int().min(1000).max(50000),
	max_per_run: z.number().int().min(1).max(50),
	include_comments: z.boolean(),
	comment_max_items: z.number().int().min(0).max(200),
	cron_secret: z.string().min(16).max(128),
});

export async function GET() {
	try {
		const config = await getOrCreateConfig();
		return NextResponse.json(config);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
	}

	const parsed = ConfigSchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues.map((issue) => issue.message).join(", ");
		return NextResponse.json({ error: message || "Invalid config payload." }, { status: 400 });
	}

	const payload = parsed.data;

	try {
		const res = await pool.query(
			`
			INSERT INTO app_config (
				id,
				schedule_enabled,
				schedule_interval_minutes,
				max_content_chars,
				max_per_run,
				include_comments,
				comment_max_items,
				cron_secret,
				updated_at
			)
			VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
			ON CONFLICT (id) DO UPDATE SET
				schedule_enabled = EXCLUDED.schedule_enabled,
				schedule_interval_minutes = EXCLUDED.schedule_interval_minutes,
				max_content_chars = EXCLUDED.max_content_chars,
				max_per_run = EXCLUDED.max_per_run,
				include_comments = EXCLUDED.include_comments,
				comment_max_items = EXCLUDED.comment_max_items,
				cron_secret = EXCLUDED.cron_secret,
				updated_at = now()
			RETURNING *;
		`,
			[
				payload.schedule_enabled,
				payload.schedule_interval_minutes,
				payload.max_content_chars,
				payload.max_per_run,
				payload.include_comments,
				payload.comment_max_items,
				payload.cron_secret,
			],
		);
		return NextResponse.json(res.rows[0]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
