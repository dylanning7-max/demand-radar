import { pool } from "../db";

export type TopSignal = {
	id: string;
	updated_at: string;
	title: string;
	pain_snippet: string;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	low_confidence: boolean;
	source_label: string;
	source_url: string;
	action: "saved" | "ignored" | "watching" | null;
	tags: string[];
	note: string | null;
	action_updated_at: string | null;
};

type RawSignalRow = {
	id: string;
	updated_at: string;
	source_id: string | null;
	url_normalized: string;
	need_card_json: unknown | null;
	meta: Record<string, unknown> | null;
	low_confidence: boolean | null;
	source_label: string | null;
	action: string | null;
	tags: string[] | null;
	note: string | null;
	action_updated_at: string | null;
};

const WTP_WEIGHT: Record<string, number> = {
	STRONG: 3,
	MEDIUM: 2,
	WEAK: 1,
	NONE: 0,
};

function clampText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars).trim();
}

function normalizeWtp(value: unknown): TopSignal["wtp_signal"] {
	const normalized = String(value ?? "").toUpperCase();
	if (normalized === "STRONG") return "STRONG";
	if (normalized === "MEDIUM") return "MEDIUM";
	if (normalized === "WEAK") return "WEAK";
	if (normalized === "NONE") return "NONE";
	const lower = String(value ?? "").toLowerCase();
	if (lower === "strong") return "STRONG";
	if (lower === "medium") return "MEDIUM";
	if (lower === "weak") return "WEAK";
	if (lower === "none") return "NONE";
	return "NONE";
}

function extractNeedCard(row: RawSignalRow): Record<string, unknown> | null {
	if (!row.need_card_json || typeof row.need_card_json !== "object") return null;
	return row.need_card_json as Record<string, unknown>;
}

function extractKind(card: Record<string, unknown>): { demand: boolean; noDemand: boolean } {
	const kind = String(card.kind ?? "").toUpperCase();
	const status = String(card.status ?? "").toLowerCase();
	const demand = kind === "DEMAND" || status === "valid";
	const noDemand = kind === "NO_DEMAND" || status === "irrelevant";
	return { demand, noDemand };
}

function extractWtp(card: Record<string, unknown>): TopSignal["wtp_signal"] {
	if (typeof card.wtp_signal === "string") {
		return normalizeWtp(card.wtp_signal);
	}
	const wtp = card.wtp as { signal?: unknown } | undefined;
	if (wtp && typeof wtp.signal === "string") {
		return normalizeWtp(wtp.signal);
	}
	return "NONE";
}

function extractTitle(card: Record<string, unknown>): string {
	const title =
		typeof card.title === "string" && card.title.trim().length > 0
			? card.title.trim()
			: "(Untitled)";
	return title;
}

function extractSnippet(card: Record<string, unknown>): string {
	const pain = typeof card.pain === "string" ? card.pain.trim() : "";
	if (pain) return clampText(pain, 120);
	const trigger = typeof card.trigger === "string" ? card.trigger.trim() : "";
	if (trigger) return clampText(trigger, 120);
	return "";
}

function extractSourceUrl(row: RawSignalRow): string {
	const meta = row.meta as { hn?: { target_url?: unknown } } | null;
	const hnTarget =
		meta && typeof meta.hn?.target_url === "string" ? meta.hn.target_url : null;
	return hnTarget || row.url_normalized;
}

export async function getTopSignals(input: {
	limit?: number;
	hours?: number;
	showIgnored?: boolean;
}): Promise<TopSignal[]> {
	const limit = Math.max(1, input.limit ?? 10);
	const hours = Math.max(1, input.hours ?? 72);
	const take = Math.min(limit * 5, 50);
	const showIgnored = Boolean(input.showIgnored);

	const res = await pool.query<RawSignalRow>(
		`
		SELECT
			a.id,
			a.updated_at,
			a.source_id,
			a.url_normalized,
			a.need_card_json,
			a.meta,
			a.low_confidence,
			s.name AS source_label,
			aa.action,
			aa.tags,
			aa.note,
			aa.updated_at AS action_updated_at
		FROM url_analyses a
		LEFT JOIN sources s ON a.source_id = s.id
		LEFT JOIN analysis_actions aa ON aa.analysis_id = a.id
		WHERE a.updated_at >= now() - ($1::int || ' hours')::interval
			AND a.status = 'success'
			AND a.need_card_json IS NOT NULL
			AND ($3::boolean = true OR aa.action IS DISTINCT FROM 'ignored')
		ORDER BY a.updated_at DESC
		LIMIT $2
	`,
		[hours, take, showIgnored],
	);

	const filtered: TopSignal[] = [];

	for (const row of res.rows) {
		const card = extractNeedCard(row);
		if (!card) continue;
		const { demand, noDemand } = extractKind(card);
		if (!demand || noDemand) continue;
		const wtp = extractWtp(card);
		if (wtp === "NONE") continue;

		const action =
			row.action === "saved" || row.action === "ignored" || row.action === "watching"
				? row.action
				: null;
		const tags = Array.isArray(row.tags) ? row.tags : [];

		filtered.push({
			id: row.id,
			updated_at: row.updated_at,
			title: extractTitle(card),
			pain_snippet: extractSnippet(card),
			wtp_signal: wtp,
			low_confidence: Boolean(row.low_confidence),
			source_label: row.source_label ?? "Manual",
			source_url: extractSourceUrl(row),
			action,
			tags,
			note: row.note ?? null,
			action_updated_at: row.action_updated_at ?? null,
		});
	}

	filtered.sort((a, b) => {
		const aLow = a.low_confidence ? 1 : 0;
		const bLow = b.low_confidence ? 1 : 0;
		if (aLow !== bLow) return aLow - bLow;
		const aWtp = WTP_WEIGHT[a.wtp_signal] ?? 0;
		const bWtp = WTP_WEIGHT[b.wtp_signal] ?? 0;
		if (aWtp !== bWtp) return bWtp - aWtp;
		const aTime = Date.parse(a.updated_at);
		const bTime = Date.parse(b.updated_at);
		if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return bTime - aTime;
		return String(b.updated_at).localeCompare(String(a.updated_at));
	});

	return filtered.slice(0, limit);
}
