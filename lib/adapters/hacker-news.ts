import { JSDOM } from "jsdom";
import { DiscoveryResult, SourceAdapter, SourceRow } from "./base";
import { withRetry } from "../utils/retry";
import { withTimeout } from "../utils/timeout";

export type HnItem = {
	id: number;
	title?: string;
	url?: string;
	text?: string;
	kids?: number[];
	dead?: boolean;
	deleted?: boolean;
	type?: string;
};

type FetchOptions = {
	timeoutMs?: number;
	signal?: AbortSignal;
};

export type HnFetchAttempt = {
	method: "hn_item_api_firebase" | "hn_item_api_algolia";
	ok: boolean;
	ms: number;
	error?: string;
};

export type HnResolveResult = {
	item: HnItem | null;
	source: "firebase" | "algolia" | null;
	attempts: HnFetchAttempt[];
};

export class HnItemFetchError extends Error {
	constructor(message = "HN item fetch failed") {
		super(message);
		this.name = "HnItemFetchError";
	}
}

type AlgoliaItem = {
	id?: number;
	title?: string;
	text?: string;
	url?: string;
	children?: Array<{ id?: number }>;
	dead?: boolean;
	deleted?: boolean;
	type?: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;

class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}

async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return withTimeout(
		async (signal) => {
			const res = await fetch(url, { signal });
			if (!res.ok) {
				throw new HttpError(res.status, `HTTP ${res.status} ${res.statusText}`.trim());
			}
			return (await res.json()) as T;
		},
		timeoutMs,
		options.signal,
	);
}

function normalizeHnItem(
	item: Partial<HnItem> | null | undefined,
	fallbackId: number,
): HnItem {
	return {
		id: item?.id ?? fallbackId,
		title: item?.title ?? undefined,
		text: item?.text ?? undefined,
		url: item?.url ?? undefined,
		kids: item?.kids ?? undefined,
		dead: item?.dead ?? undefined,
		deleted: item?.deleted ?? undefined,
		type: item?.type ?? undefined,
	};
}

function normalizeAlgoliaItem(item: AlgoliaItem, fallbackId: number): HnItem {
	const kids = item.children
		?.map((child) => child.id)
		.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
	return {
		id: item.id ?? fallbackId,
		title: item.title ?? undefined,
		text: item.text ?? undefined,
		url: item.url ?? undefined,
		kids: kids && kids.length > 0 ? kids : undefined,
		dead: item.dead ?? undefined,
		deleted: item.deleted ?? undefined,
		type: item.type ?? undefined,
	};
}

function toErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function fetchHnItemFirebase(
	id: number,
	options: FetchOptions,
	attempts: HnFetchAttempt[],
): Promise<HnItem | null> {
	const url = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
	try {
		return await withRetry(
			async () => {
				const start = Date.now();
				try {
					const item = await fetchJson<HnItem | null>(url, {
						timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
						signal: options.signal,
					});
					if (!item || typeof item !== "object") {
						throw new Error("Empty HN item response");
					}
					attempts.push({
						method: "hn_item_api_firebase",
						ok: true,
						ms: Date.now() - start,
					});
					return normalizeHnItem(item, id);
				} catch (err) {
					attempts.push({
						method: "hn_item_api_firebase",
						ok: false,
						ms: Date.now() - start,
						error: toErrorMessage(err),
					});
					throw err;
				}
			},
			{ retries: 2, backoffMs: 250 },
		);
	} catch {
		return null;
	}
}

async function fetchHnItemAlgolia(
	id: number,
	options: FetchOptions,
	attempts: HnFetchAttempt[],
): Promise<HnItem | null> {
	try {
		return await withRetry(
			async () => {
				const start = Date.now();
				try {
					const item = await fetchJson<AlgoliaItem | null>(
						`https://hn.algolia.com/api/v1/items/${id}`,
						{ timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal: options.signal },
					);
					if (!item || typeof item !== "object") {
						throw new Error("Empty Algolia item response");
					}
					attempts.push({
						method: "hn_item_api_algolia",
						ok: true,
						ms: Date.now() - start,
					});
					return normalizeAlgoliaItem(item, id);
				} catch (err) {
					attempts.push({
						method: "hn_item_api_algolia",
						ok: false,
						ms: Date.now() - start,
						error: toErrorMessage(err),
					});
					throw err;
				}
			},
			{ retries: 1, backoffMs: 250 },
		);
	} catch {
		return null;
	}
}

export function toPermalink(id: number): string {
	return `https://news.ycombinator.com/item?id=${id}`;
}

export function parseHnItemId(input: string): number | null {
	try {
		const url = new URL(input);
		if (url.hostname !== "news.ycombinator.com") return null;
		if (url.pathname !== "/item") return null;
		const idParam = url.searchParams.get("id");
		if (!idParam) return null;
		const id = Number(idParam);
		return Number.isFinite(id) ? id : null;
	} catch {
		return null;
	}
}

export async function fetchHnItemIds(
	entryUrl: string,
	options: FetchOptions = {},
): Promise<number[]> {
	const ids = await withRetry(
		async () => {
			const data = await fetchJson<unknown>(entryUrl, options);
			if (!Array.isArray(data)) {
				throw new Error("Invalid HN id list");
			}
			return data.filter(
				(id): id is number => typeof id === "number" && Number.isFinite(id),
			);
		},
		{ retries: 2, backoffMs: 250 },
	);
	return ids;
}

export async function resolveHnItem(
	id: number,
	options: FetchOptions = {},
): Promise<HnResolveResult> {
	const attempts: HnFetchAttempt[] = [];
	const firebaseItem = await fetchHnItemFirebase(id, options, attempts);
	if (firebaseItem) {
		return { item: firebaseItem, source: "firebase", attempts };
	}

	const algoliaItem = await fetchHnItemAlgolia(id, options, attempts);
	if (algoliaItem) {
		return { item: algoliaItem, source: "algolia", attempts };
	}

	return { item: null, source: null, attempts };
}

export async function fetchHnItem(
	id: number,
	options: FetchOptions = {},
): Promise<HnItem> {
	const resolved = await resolveHnItem(id, options);
	if (!resolved.item) {
		throw new HnItemFetchError();
	}
	return resolved.item;
}

export function htmlToText(html: string): string {
	if (!html) return "";
	const dom = new JSDOM(`<body>${html}</body>`);
	const text = dom.window.document.body.textContent ?? "";
	return text.replace(/\s+/g, " ").trim();
}

export class HackerNewsAdapter implements SourceAdapter {
	async discover(source: SourceRow): Promise<DiscoveryResult[]> {
		const ids = await fetchHnItemIds(source.entry_url, { timeoutMs: 8_000 });
		const limit = Math.max(0, source.discover_limit ?? 20);
		const selected = ids.slice(0, limit);
		const results: DiscoveryResult[] = [];
		const seen = new Set<string>();

		for (const id of selected) {
			try {
				const item = await fetchHnItem(id, { timeoutMs: 8_000 });
				const url = item.url ?? toPermalink(id);
				if (seen.has(url)) continue;
				seen.add(url);
				results.push({
					source_id: source.id,
					url,
					origin_title: item.title ?? null,
					origin_id: String(id),
				});
			} catch {
				continue;
			}
		}

		return results;
	}
}
