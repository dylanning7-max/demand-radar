import { NextResponse } from "next/server";
import { listSavedAnalyses } from "../../../lib/stores/analysis_actions_store";

type SavedItem = {
	id: string;
	title: string;
	source_url: string;
	evidence_quote: string | null;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	action: "saved" | "watching";
	tags: string[];
	note: string | null;
	action_updated_at: string;
};

function extractNeedCard(row: { need_card_json: Record<string, unknown> | null }) {
	return row.need_card_json ?? null;
}

function normalizeWtp(value: unknown): SavedItem["wtp_signal"] {
	const normalized = String(value ?? "").toUpperCase();
	if (normalized === "STRONG") return "STRONG";
	if (normalized === "MEDIUM") return "MEDIUM";
	if (normalized === "WEAK") return "WEAK";
	return "NONE";
}

function resolveWtp(card: Record<string, unknown> | null): SavedItem["wtp_signal"] {
	if (!card) return "NONE";
	if (typeof card.wtp_signal === "string") return normalizeWtp(card.wtp_signal);
	const wtp = card.wtp as { signal?: unknown } | undefined;
	if (wtp && typeof wtp.signal === "string") return normalizeWtp(wtp.signal);
	return "NONE";
}

function resolveTitle(card: Record<string, unknown> | null): string {
	if (!card) return "(Untitled)";
	const title = typeof card.title === "string" ? card.title.trim() : "";
	return title || "(Untitled)";
}

function resolveEvidence(card: Record<string, unknown> | null): string | null {
	if (!card) return null;
	const quote = typeof card.evidence_quote === "string" ? card.evidence_quote.trim() : "";
	return quote || null;
}

function resolveSourceUrl(row: {
	meta: Record<string, unknown> | null;
	url_normalized: string;
}): string {
	const meta = row.meta as { hn?: { target_url?: unknown } } | null;
	if (meta && typeof meta.hn?.target_url === "string") {
		return meta.hn.target_url;
	}
	return row.url_normalized;
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const tag = url.searchParams.get("tag")?.trim() || undefined;
		const rows = await listSavedAnalyses(tag);
		const items: SavedItem[] = rows.map((row) => {
			const card = extractNeedCard(row);
			return {
				id: row.id,
				title: resolveTitle(card),
				source_url: resolveSourceUrl(row),
				evidence_quote: resolveEvidence(card),
				wtp_signal: resolveWtp(card),
				action: row.action,
				tags: row.tags ?? [],
				note: row.note ?? null,
				action_updated_at: row.action_updated_at,
			};
		});
		return NextResponse.json({ items });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
