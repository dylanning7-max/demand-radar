import { NextResponse } from "next/server";
import { listAnalyses } from "../../../lib/stores/analyses_store";

type NeedCardSummary = {
	kind: "DEMAND" | "NO_DEMAND" | "UNKNOWN";
	title: string;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	low_confidence: boolean;
};

type AnalysisListItem = {
	id: string;
	updated_at: string;
	source_url: string;
	source_label: string | null;
	status: "success" | "failed";
	need_card_summary: NeedCardSummary;
	action: "saved" | "ignored" | "watching" | null;
	tags: string[];
	note: string | null;
	action_updated_at: string | null;
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function clampLimit(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function parseOffset(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function parseShowIgnored(value: string | null): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true";
}

function normalizeWtp(value: unknown): NeedCardSummary["wtp_signal"] {
	const normalized = String(value ?? "").toUpperCase();
	if (normalized === "STRONG") return "STRONG";
	if (normalized === "MEDIUM") return "MEDIUM";
	if (normalized === "WEAK") return "WEAK";
	return "NONE";
}

function buildSummary(row: {
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
}): AnalysisListItem {
	const lowConfidence = Boolean(row.low_confidence);
	const sourceUrl = row.hn_target_url || row.url_normalized;
	const tags = Array.isArray(row.tags) ? row.tags : [];
	const action =
		row.action === "saved" || row.action === "ignored" || row.action === "watching"
			? row.action
			: null;

	if (row.status === "failed") {
		return {
			id: row.id,
			updated_at: row.updated_at,
			source_url: sourceUrl,
			source_label: row.source_label ?? null,
			status: row.status,
			action,
			tags,
			note: row.note ?? null,
			action_updated_at: row.action_updated_at ?? null,
			need_card_summary: {
				kind: "UNKNOWN",
				title: "Analysis Failed",
				wtp_signal: "NONE",
				low_confidence: lowConfidence,
			},
		};
	}

	if (
		!row.need_kind &&
		!row.need_title &&
		!row.need_wtp &&
		!row.need_pain
	) {
		return {
			id: row.id,
			updated_at: row.updated_at,
			source_url: sourceUrl,
			source_label: row.source_label ?? null,
			status: row.status,
			action,
			tags,
			note: row.note ?? null,
			action_updated_at: row.action_updated_at ?? null,
			need_card_summary: {
				kind: "UNKNOWN",
				title: "(No Need Card)",
				wtp_signal: "NONE",
				low_confidence: lowConfidence,
			},
		};
	}

	const kindValue = String(row.need_kind ?? "").toUpperCase();
	const kind =
		kindValue === "DEMAND" || kindValue === "NO_DEMAND"
			? (kindValue as "DEMAND" | "NO_DEMAND")
			: row.need_pain
				? "DEMAND"
				: "UNKNOWN";
	const title =
		typeof row.need_title === "string" && row.need_title.trim().length > 0
			? row.need_title.trim()
			: kind === "DEMAND" && typeof row.need_pain === "string" && row.need_pain.trim().length > 0
				? row.need_pain.trim()
			: kind === "NO_DEMAND"
				? "No Demand Detected"
				: "Untitled";

	return {
		id: row.id,
		updated_at: row.updated_at,
		source_url: sourceUrl,
		source_label: row.source_label ?? null,
		status: row.status,
		action,
		tags,
		note: row.note ?? null,
		action_updated_at: row.action_updated_at ?? null,
		need_card_summary: {
			kind,
			title,
			wtp_signal: normalizeWtp(row.need_wtp),
			low_confidence: lowConfidence,
		},
	};
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const limit = clampLimit(url.searchParams.get("limit"));
		const offset = parseOffset(url.searchParams.get("cursor"));
		const showIgnored = parseShowIgnored(url.searchParams.get("show_ignored"));
		const rows = await listAnalyses({ limit, offset, showIgnored });
		const items = rows.map(buildSummary);
		const nextCursor = rows.length === limit ? String(offset + rows.length) : null;
		return NextResponse.json({ items, next_cursor: nextCursor });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
