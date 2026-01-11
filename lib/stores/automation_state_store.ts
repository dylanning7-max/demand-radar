import { pool } from "../db";

export type AutomationStateRow = {
	key: string;
	value: Record<string, unknown>;
	updated_at: string;
};

function safeJson(value: unknown, fallback: unknown): string {
	try {
		return JSON.stringify(value ?? fallback);
	} catch {
		return JSON.stringify(fallback);
	}
}

export async function getAutomationState(
	key = "health",
): Promise<AutomationStateRow | null> {
	const res = await pool.query<AutomationStateRow>(
		"SELECT key, value, updated_at FROM automation_state WHERE key = $1",
		[key],
	);
	return res.rows[0] ?? null;
}

export async function updateAutomationState(
	patch: Record<string, unknown>,
	key = "health",
): Promise<AutomationStateRow | null> {
	const patchJson = safeJson(patch, {});
	const res = await pool.query<AutomationStateRow>(
		`
		UPDATE automation_state
		SET value = value || $2::jsonb
		WHERE key = $1
		RETURNING key, value, updated_at
	`,
		[key, patchJson],
	);
	return res.rows[0] ?? null;
}
