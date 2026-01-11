import { NextResponse } from "next/server";
import { listJobRuns } from "../../../lib/stores/job_runs_store";

type JobStats = {
	discovered: number;
	deduped_new: number;
	deduped_existing: number;
	analyzed: number;
	failed: number;
};

type JobMetaStats = {
	total: number;
	success: number;
	failed: number;
	hn_fallback: number;
	fetch_fallback: number;
	jina_invalid: number;
	timebox_exceeded: number;
};

type JobListItem = {
	id: string;
	started_at: string;
	finished_at: string | null;
	trigger: "manual" | "cron";
	status: "success" | "failed";
	error: string | null;
	log: string | null;
	stats: JobStats;
	meta_stats: JobMetaStats | null;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function parseJobStats(log: string | null): JobStats {
	const stats: JobStats = {
		discovered: 0,
		deduped_new: 0,
		deduped_existing: 0,
		analyzed: 0,
		failed: 0,
	};
	if (!log) return stats;

	const lines = log.split("\n");
	const patterns: Array<keyof JobStats> = [
		"discovered",
		"deduped_new",
		"deduped_existing",
		"analyzed",
		"failed",
	];

	for (const line of lines) {
		for (const key of patterns) {
			const match = line.match(new RegExp(`${key}=(\\d+)`));
			if (match) {
				stats[key] += Number(match[1]);
			}
		}
	}
	return stats;
}

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function parseMetaStats(meta: unknown): JobMetaStats | null {
	let metaObj: unknown = meta;
	if (typeof meta === "string") {
		try {
			metaObj = JSON.parse(meta);
		} catch {
			return null;
		}
	}
	if (!metaObj || typeof metaObj !== "object") return null;
	const stats = (metaObj as { stats?: unknown }).stats;
	if (!stats || typeof stats !== "object") return null;
	const raw = stats as Record<string, unknown>;
	return {
		total: toNumber(raw.total),
		success: toNumber(raw.success),
		failed: toNumber(raw.failed),
		hn_fallback: toNumber(raw.hn_fallback),
		fetch_fallback: toNumber(raw.fetch_fallback),
		jina_invalid: toNumber(raw.jina_invalid),
		timebox_exceeded: toNumber(raw.timebox_exceeded),
	};
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const limit = clampLimit(url.searchParams.get("limit"));
		const offset = parseOffset(url.searchParams.get("cursor"));
		const rows = await listJobRuns({ limit, offset });
		const items: JobListItem[] = rows.map((row) => {
			const { meta, ...rest } = row;
			return {
				...rest,
				stats: parseJobStats(row.log),
				meta_stats: parseMetaStats(meta),
			};
		});
		const nextCursor = rows.length === limit ? String(offset + rows.length) : null;
		return NextResponse.json({ items, next_cursor: nextCursor });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
