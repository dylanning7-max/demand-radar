import { NextResponse } from "next/server";
import { getTopSignals } from "../../../../lib/stores/signals_store";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const ALLOWED_HOURS = new Set([24, 72, 168]);

function parseLimit(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function parseHours(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 72;
	if (ALLOWED_HOURS.has(parsed)) return parsed;
	return 72;
}

function parseShowIgnored(value: string | null): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true";
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const limit = parseLimit(url.searchParams.get("limit"));
		const hours = parseHours(url.searchParams.get("hours"));
		const showIgnored = parseShowIgnored(url.searchParams.get("show_ignored"));
		const items = await getTopSignals({ limit, hours, showIgnored });
		return NextResponse.json({ items });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
