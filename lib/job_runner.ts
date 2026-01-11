import { analyzePipeline } from "./analyze_pipeline";
import { getOrCreateConfig } from "./config_store";
import { pool } from "./db";
import { getAdapter } from "./adapters";
import { normalizeUrl } from "./url_normalize";
import { upsertUrlAnalysis } from "./url_analyses_store";
import { listEnabledSources, touchSourceCheckedAt } from "./stores/sources_store";
import { readIntEnv } from "./utils/env";
import { withTimeout } from "./utils/timeout";

export type JobRunRow = {
	id: string;
	job_name: string;
	trigger: "manual" | "cron";
	status: "running" | "success" | "failed";
	started_at: string;
	finished_at: string | null;
	log: string | null;
	error: string | null;
	meta?: Record<string, unknown> | null;
};

type JobErrorEntry = {
	stage: "discover" | "dedupe" | "analyze";
	source_id: string;
	source_name: string;
	type: "ABORTED" | "ERROR";
	message: string;
	url?: string;
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

function truncateText(text: string | null, maxChars: number): string | null {
	if (!text) return null;
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars);
}

function isAbortError(err: unknown): boolean {
	if (err instanceof Error && err.name === "AbortError") return true;
	const message = err instanceof Error ? err.message : String(err);
	return /aborted/i.test(message);
}

function toErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function nowIso(): string {
	return new Date().toISOString();
}

function safeJson(value: unknown, fallback: unknown): string {
	try {
		return JSON.stringify(value ?? fallback);
	} catch {
		return JSON.stringify(fallback);
	}
}

function initStats(): JobMetaStats {
	return {
		total: 0,
		success: 0,
		failed: 0,
		hn_fallback: 0,
		fetch_fallback: 0,
		jina_invalid: 0,
		timebox_exceeded: 0,
	};
}

function updateStats(
	stats: JobMetaStats,
	result: {
		status: "success" | "failed";
		warnings: Array<{ type?: string | null }>;
		meta?: { fetch?: { fallback?: boolean } };
		fail_reason?: string | null;
	},
) {
	stats.total += 1;
	if (result.status === "success") {
		stats.success += 1;
	} else {
		stats.failed += 1;
	}

	const warningTypes = new Set(
		(result.warnings ?? [])
			.map((warning) => warning?.type)
			.filter((type): type is string => Boolean(type)),
	);

	if (warningTypes.has("HN_FALLBACK")) {
		stats.hn_fallback += 1;
	}

	const fetchFallback =
		warningTypes.has("FETCH_FALLBACK") ||
		result.meta?.fetch?.fallback === true;
	if (fetchFallback) {
		stats.fetch_fallback += 1;
	}

	const jinaInvalid =
		warningTypes.has("JINA_INVALID_CONTENT") ||
		result.fail_reason === "JINA_INVALID_CONTENT";
	if (jinaInvalid) {
		stats.jina_invalid += 1;
	}

	if (result.fail_reason === "ITEM_TIMEBOX_EXCEEDED") {
		stats.timebox_exceeded += 1;
	}
}

function buildSourceLog(input: {
	source_name: string;
	source_id: string;
	discovered_count: number;
	deduped_existing_count: number;
	deduped_new_count: number;
	analyzed_count: number;
	failures_count: number;
	analyzed_urls: string[];
}): string {
	return [
		`source=${input.source_name}(${input.source_id})`,
		`discovered=${input.discovered_count}`,
		`deduped_new=${input.deduped_new_count}`,
		`deduped_existing=${input.deduped_existing_count}`,
		`analyzed=${input.analyzed_count}`,
		`failed=${input.failures_count}`,
		`analyzed_urls=${input.analyzed_urls.join(",")}`,
	].join(" ");
}

function buildJobLog(
	logEntries: string[],
	errors: JobErrorEntry[],
	totalNewCandidates: number,
): string | null {
	const lines = [...logEntries];
	if (totalNewCandidates === 0) {
		lines.push("NO_NEW_URLS");
	}
	if (errors.length > 0) {
		lines.push(`errors=${JSON.stringify(errors)}`);
	}
	return lines.length > 0 ? lines.join("\n") : null;
}

async function insertJobRun(params: {
	job_name: "pull_demands";
	trigger: "manual" | "cron";
	status: "running" | "failed";
	error?: string | null;
	log?: string | null;
	finished?: boolean;
}): Promise<JobRunRow> {
	const { job_name, trigger, status, error, log, finished } = params;
	const res = await pool.query<JobRunRow>(
		`
		INSERT INTO job_runs (
			id,
			job_name,
			trigger,
			status,
			started_at,
			finished_at,
			log,
			error,
			meta
		)
		VALUES (
			gen_random_uuid(),
			$1,
			$2,
			$3,
			now(),
			${finished ? "now()" : "NULL"},
			$4,
			$5,
			'{}'::jsonb
		)
		RETURNING *;
	`,
		[job_name, trigger, status, log ?? null, error ?? null],
	);
	return res.rows[0];
}

async function updateJobRun(
	id: string,
	status: "success" | "failed",
	log: string | null,
	error: string | null,
	meta: Record<string, unknown>,
): Promise<JobRunRow> {
	const metaJson = safeJson(meta, {});
	const res = await pool.query<JobRunRow>(
		`
		UPDATE job_runs
		SET status = $2, finished_at = now(), log = $3, error = $4, meta = $5::jsonb
		WHERE id = $1
		RETURNING *;
	`,
		[id, status, log, error, metaJson],
	);
	return res.rows[0];
}

export async function runJob(
	jobName: "pull_demands",
	trigger: "manual" | "cron",
): Promise<JobRunRow> {
	const config = await getOrCreateConfig();
	const maxContentChars = config.max_content_chars ?? 12_000;
	const includeComments = config.include_comments ?? false;
	const commentMaxItems = config.comment_max_items ?? 30;
	const maxPerRun = Math.max(1, config.max_per_run ?? 5);
	const itemTimeboxMs = readIntEnv("ITEM_ANALYSIS_TIMEBOX_MS", 35_000);

	const sources = await listEnabledSources();
	if (sources.length === 0) {
		return insertJobRun({
			job_name: jobName,
			trigger,
			status: "failed",
			error: "NO_SOURCES_ENABLED",
			finished: true,
		});
	}

	const jobRun = await insertJobRun({
		job_name: jobName,
		trigger,
		status: "running",
	});

	let totalAnalyzed = 0;
	let totalNewCandidates = 0;
	const logEntries: string[] = [];
	const errors: JobErrorEntry[] = [];
	const stats = initStats();

	try {
		for (const source of sources) {
			let analyzedCount = 0;
			let dedupedExisting = 0;
			let dedupedNew = 0;
			let failuresCount = 0;
			let discoveredCount = 0;
			const analyzedUrls: string[] = [];
			let skipSource = false;
			let normalizedMap = new Map<string, string>();

			try {
				const adapter = getAdapter(source.type);
				let discovered = [] as { url: string }[];
				try {
					discovered = await adapter.discover(source);
				} catch (err) {
					if (isAbortError(err)) {
						failuresCount += 1;
						errors.push({
							stage: "discover",
							source_id: source.id,
							source_name: source.name,
							type: "ABORTED",
							message: toErrorMessage(err),
						});
						skipSource = true;
					} else {
						throw err;
					}
				}

				if (skipSource) {
					continue;
				}

				for (const item of discovered) {
					try {
						const normalized = normalizeUrl(item.url);
						if (!normalizedMap.has(normalized)) {
							normalizedMap.set(normalized, item.url);
						}
					} catch {
						continue;
					}
				}

				discoveredCount = normalizedMap.size;

				const normalizedList = Array.from(normalizedMap.keys());
				let existingSet = new Set<string>();
				if (normalizedList.length > 0) {
					try {
						const existingRes = await pool.query<{ url_normalized: string }>(
							"SELECT url_normalized FROM url_analyses WHERE url_normalized = ANY($1)",
							[normalizedList],
						);
						existingSet = new Set(
							existingRes.rows.map((row) => row.url_normalized),
						);
					} catch (err) {
						if (isAbortError(err)) {
							failuresCount += 1;
							errors.push({
								stage: "dedupe",
								source_id: source.id,
								source_name: source.name,
								type: "ABORTED",
								message: toErrorMessage(err),
							});
							skipSource = true;
						} else {
							throw err;
						}
					}
				}

				if (skipSource) {
					continue;
				}

				const newCandidates = normalizedList.filter(
					(url) => !existingSet.has(url),
				);
				dedupedExisting = normalizedList.length - newCandidates.length;
				dedupedNew = newCandidates.length;
				totalNewCandidates += newCandidates.length;

				const remaining = Math.max(0, maxPerRun - totalAnalyzed);
				const toAnalyze = newCandidates.slice(0, remaining);

				for (const normalized of toAnalyze) {
					if (totalAnalyzed >= maxPerRun) break;
					const originalUrl = normalizedMap.get(normalized) ?? normalized;
					try {
						const result = await withTimeout(
							(signal) =>
								analyzePipeline(originalUrl, {
									maxContentChars,
									includeComments,
									commentMaxItems,
									signal,
								}),
							itemTimeboxMs,
						);

						const status = result.need_card ? "success" : "failed";
						const error =
							status === "failed"
								? result.error?.trim() || result.fail_reason || "ANALYSIS_FAILED"
								: null;

						const contentText = truncateText(
							result.source_text,
							maxContentChars,
						);

						updateStats(stats, {
							status,
							warnings: result.warnings ?? [],
							meta: result.meta,
							fail_reason: status === "failed" ? result.fail_reason : null,
						});

						await upsertUrlAnalysis({
							url: result.url,
							url_normalized: result.url_normalized,
							source_id: source.id,
							status,
							step: result.step,
							extractor_used: result.extractor_used,
							extracted_len: result.extracted_len,
							fail_reason: status === "failed" ? result.fail_reason : null,
							content_text: contentText,
							need_card_json: result.need_card,
							warnings: result.warnings ?? [],
							meta: result.meta ?? {},
							low_confidence: result.low_confidence ?? false,
							error,
						});

						analyzedCount += 1;
						totalAnalyzed += 1;
						if (status === "failed") {
							failuresCount += 1;
						}
						analyzedUrls.push(result.url_normalized);
					} catch (err) {
						failuresCount += 1;
						const errorMessage = toErrorMessage(err);
						const isAborted = isAbortError(err);
						const failReason = isAborted
							? "ITEM_TIMEBOX_EXCEEDED"
							: "ANALYSIS_FAILED";
						updateStats(stats, {
							status: "failed",
							warnings: [{ type: failReason }],
							meta: { fetch: { fallback: false } },
							fail_reason: failReason,
						});
						errors.push({
							stage: "analyze",
							source_id: source.id,
							source_name: source.name,
							type: isAborted ? "ABORTED" : "ERROR",
							message: errorMessage,
							url: originalUrl,
						});
						try {
							await upsertUrlAnalysis({
								url: originalUrl,
								url_normalized: normalized,
								source_id: source.id,
								status: "failed",
								step: "fetched",
								extractor_used: "readability",
								extracted_len: 0,
								fail_reason: failReason,
								content_text: null,
								need_card_json: null,
								warnings: [
									{
										type: failReason,
										at: nowIso(),
										message: errorMessage,
									},
								],
								meta: {
									fetch: { used: "direct", fallback: false, attempts: [] },
									error: {
										name: err instanceof Error ? err.name : "Error",
										message: errorMessage,
									},
								},
								low_confidence: false,
								error: errorMessage,
							});
						} catch {
							// best-effort logging only
						}
					}
				}
			} finally {
				await touchSourceCheckedAt(source.id);
			}

			logEntries.push(
				buildSourceLog({
					source_name: source.name,
					source_id: source.id,
					discovered_count: discoveredCount,
					deduped_new_count: dedupedNew,
					deduped_existing_count: dedupedExisting,
					analyzed_count: analyzedCount,
					failures_count: failuresCount,
					analyzed_urls: analyzedUrls,
				}),
			);

			if (totalAnalyzed >= maxPerRun) {
				continue;
			}
		}

		const log = buildJobLog(logEntries, errors, totalNewCandidates);
		const meta = {
			stats,
			rates: {
				fallback_rate: stats.total > 0 ? stats.fetch_fallback / stats.total : 0,
				fail_rate: stats.total > 0 ? stats.failed / stats.total : 0,
			},
		};
		return updateJobRun(jobRun.id, "success", log, null, meta);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const log = buildJobLog(logEntries, errors, totalNewCandidates);
		const meta = {
			stats,
			rates: {
				fallback_rate: stats.total > 0 ? stats.fetch_fallback / stats.total : 0,
				fail_rate: stats.total > 0 ? stats.failed / stats.total : 0,
			},
		};
		return updateJobRun(jobRun.id, "failed", log, message, meta);
	}
}
