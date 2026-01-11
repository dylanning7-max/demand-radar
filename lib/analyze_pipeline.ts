import { z } from "zod";
import { extractReadability } from "./extract_readability";
import { fetchText } from "./fetch_text";
import { fetchJinaReaderText } from "./fallback_jina_reader";
import { normalizeUrl } from "./url_normalize";
import { buildNeedCardPrompt, NEED_CARD_PROMPT_VERSION } from "./prompts/need_card_v1";
import { NeedCardV1Schema } from "./schemas/need_card_v1";
import type { NeedCardV1 } from "./schemas/need_card_v1";
import { normalizeForMatch } from "./text/normalize";
import { readIntEnv } from "./utils/env";
import {
	fetchHnItem,
	htmlToText,
	parseHnItemId,
	resolveHnItem,
	type HnFetchAttempt,
} from "./adapters/hacker-news";

export const FailReasonEnum = z.enum([
	"FETCH_FAILED",
	"READABILITY_FAILED",
	"TOO_SHORT",
	"LIKELY_JS_RENDER",
	"JINA_FAILED",
	"HN_ITEM_FETCH_FAILED",
	"JINA_INVALID_CONTENT",
	"QUOTE_NOT_FOUND",
]);

export type FailReason = z.infer<typeof FailReasonEnum>;

export type PipelineStep = "fetched" | "extracted" | "analyzed";
export type ExtractorUsed = "readability" | "jina" | "hn_discussion_api";

export type WarningEntry = {
	type: string;
	at: string;
	[key: string]: unknown;
};

export type FetchAttempt = {
	method: string;
	ok: boolean;
	ms: number;
	error?: string;
};

export type AnalysisMeta = {
	fetch: {
		used: "direct" | "jina" | "hn_discussion_api";
		fallback: boolean;
		attempts: FetchAttempt[];
		direct_error?: string;
		direct_status?: number;
	};
	hn?: {
		id: number;
		kind: "link" | "ask" | "unresolved";
		target_url: string | null;
		fetch?: { source: "firebase" | "algolia" | null; attempts: HnFetchAttempt[] };
	};
	evidence?: {
		match: "exact" | "normalized" | "fail";
	};
	llm?: {
		model: string;
		prompt_version: string;
		elapsed_ms?: number;
		parse_retry?: boolean;
	};
	timing?: {
		hn_ms?: number;
		fetch_ms?: number;
		llm_ms?: number;
		total_ms?: number;
	};
	error?: {
		name?: string;
		message?: string;
		code?: string | number;
	};
	signal_reason?: string;
};

export type AnalyzePipelineOptions = {
	maxContentChars?: number;
	extractedLenThreshold?: number;
	fetchTimeoutMs?: number;
	directTimeoutMs?: number;
	jinaTimeoutMs?: number;
	hnTimeoutMs?: number;
	maxFetchBytes?: number;
	includeComments?: boolean;
	commentMaxItems?: number;
	signal?: AbortSignal;
};

export type AnalyzePipelineResult = {
	url: string;
	url_normalized: string;
	step: PipelineStep;
	extractor_used: ExtractorUsed;
	extracted_len: number;
	title: string | null;
	source_text: string | null;
	need_card: NeedCardV1 | null;
	fail_reason: FailReason | null;
	error: string | null;
	warnings: WarningEntry[];
	meta: AnalysisMeta;
	low_confidence: boolean;
};

function clampLen(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars);
}

function nowIso(): string {
	return new Date().toISOString();
}

function addWarning(
	warnings: WarningEntry[],
	type: string,
	data: Record<string, unknown> = {},
) {
	warnings.push({ type, at: nowIso(), ...data });
}

function isTimeoutError(message: string): boolean {
	return /timeout|aborted|timed out/i.test(message);
}

const GENERIC_PHRASES = [
	"manual steps",
	"consult documentation",
	"when encountering",
	"existing tools",
];

function containsGenericPhrase(text: string): boolean {
	const normalized = text.toLowerCase();
	return GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

const DIRECT_INVALID_MIN_LEN = 100;
const JINA_INVALID_MIN_LEN = 200;
const BLOCK_KEYWORDS = [
	"access denied",
	"captcha",
	"enable javascript",
	"too many requests",
	"rate limit",
	"forbidden",
	"not authorized",
	"request blocked",
	"cloudflare",
	"attention required",
	"security check",
	"service unavailable",
];

function findBlockKeyword(text: string): string | null {
	const normalized = text.toLowerCase();
	return BLOCK_KEYWORDS.find((keyword) => normalized.includes(keyword)) ?? null;
}

function validateContent(
	text: string,
	minLen: number,
): { ok: boolean; reason?: string } {
	const trimmed = text.trim();
	if (!trimmed) return { ok: false, reason: "empty" };
	if (trimmed.length < minLen) {
		return { ok: false, reason: `too_short_${minLen}` };
	}
	const keyword = findBlockKeyword(trimmed);
	if (keyword) {
		return { ok: false, reason: `keyword:${keyword}` };
	}
	return { ok: true };
}

function sampleText(text: string, maxChars = 120): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	if (trimmed.length <= maxChars) return trimmed;
	return trimmed.slice(0, maxChars);
}

function captureErrorMeta(meta: AnalysisMeta, err: unknown) {
	if (!err) return;
	if (err instanceof Error) {
		meta.error = {
			name: err.name,
			message: err.message,
			code:
				typeof (err as { code?: unknown }).code === "string" ||
				typeof (err as { code?: unknown }).code === "number"
					? (err as { code?: string | number }).code
					: undefined,
		};
		return;
	}
	meta.error = { message: String(err) };
}

function applyTiming(input: {
	meta: AnalysisMeta;
	totalStart: number;
	hnDuration?: number;
	fetchDuration?: number;
	llmMs?: number;
}) {
	input.meta.timing = {
		hn_ms: input.hnDuration ?? input.meta.timing?.hn_ms,
		fetch_ms: input.fetchDuration ?? input.meta.timing?.fetch_ms,
		llm_ms: input.llmMs ?? input.meta.timing?.llm_ms,
		total_ms: Date.now() - input.totalStart,
	};
}

function downgradeWtp(
	wtp: NeedCardV1["wtp_signal"],
): NeedCardV1["wtp_signal"] {
	if (wtp === "NONE") return "NONE";
	return "WEAK";
}

function applyLowConfidenceGuard(input: {
	needCard: NeedCardV1;
	warnings: WarningEntry[];
	meta: AnalysisMeta;
	evidenceMatch: "exact" | "normalized" | "fail";
}): { needCard: NeedCardV1; lowConfidence: boolean } {
	const reasons: string[] = [];

	if (input.evidenceMatch === "fail") {
		reasons.push("evidence_not_substring");
	}

	if (input.needCard.kind === "DEMAND") {
		if (containsGenericPhrase(input.needCard.trigger)) {
			reasons.push("generic_trigger");
		}
		if (containsGenericPhrase(input.needCard.workaround)) {
			reasons.push("generic_workaround");
		}
		if (input.needCard.pain.length < 15 || input.needCard.pain.includes("),")) {
			reasons.push("pain_fragment");
		}
	}

	if (reasons.length === 0) {
		return { needCard: input.needCard, lowConfidence: false };
	}

	const reason = reasons.join("|");
	addWarning(input.warnings, "LOW_CONFIDENCE", { reason });
	input.meta.signal_reason = reason;

	const nextNeedCard =
		input.needCard.kind === "DEMAND"
			? { ...input.needCard, wtp_signal: downgradeWtp(input.needCard.wtp_signal) }
			: input.needCard;

	return { needCard: nextNeedCard, lowConfidence: true };
}

function pickEvidenceQuoteCandidate(sourceText: string): string | null {
	const keyword =
		"(?:cannot|can't|unable|need|wish|alternative|alternatives|workaround|bug|slow|expensive|problem|pain|frustrat(?:e|ed|ing|ion)?|issue|missing|hard|difficult|too|lack|无法|需要|希望|替代|替换|慢|贵|问题|痛点|困扰|缺少|难|太)";
	const re = new RegExp(`[^.!?。！？\\n]{0,160}${keyword}[^.!?。！？\\n]{0,160}[.!?。！？]?`, "i");
	const m = sourceText.match(re);
	const candidate = m?.[0]?.trim() ?? null;
	if (candidate && candidate.length >= 20) return candidate;

	const firstSentence =
		sourceText.match(/^[^.!?。！？\n]{20,200}[.!?。！？]?/)?.[0]?.trim() ?? null;
	if (firstSentence) return firstSentence;

	const fallback = sourceText.slice(0, 120).trim();
	return fallback.length > 0 ? fallback : null;
}

function ensureEvidenceQuote(
	sourceText: string,
	candidate: string | null,
): string | null {
	if (candidate && sourceText.includes(candidate)) {
		const trimmed = candidate.trim();
		if (trimmed.length >= 40) {
			return trimmed.length > 240 ? trimmed.slice(0, 240) : trimmed;
		}
	}
	const fallback = sourceText.trim();
	if (fallback.length < 40) return null;
	return fallback.length > 240 ? fallback.slice(0, 240) : fallback;
}

function inferWtpSignal(
	sourceText: string,
): "STRONG" | "MEDIUM" | "WEAK" | "NONE" {
	const strongRe =
		/\b(pricing|paid plan|subscribe|subscription|billing|invoice|upgrade)\b|[$€£]\s?\d+|付费|订阅|收费|价格|升级/i;
	if (strongRe.test(sourceText)) return "STRONG";
	const weakRe = /\b(pay|cost|expensive|price|budget)\b|贵|成本|价格/i;
	if (weakRe.test(sourceText)) return "WEAK";
	return "NONE";
}

function inferWho(sourceText: string, title: string | null): string {
	const hay = `${title ?? ""}\n${sourceText}`.toLowerCase();
	if (/(developer|engineer|programmer|api|sdk|cli|devops)/i.test(hay)) return "developers";
	if (/(designer|ux|ui)/i.test(hay)) return "designers";
	if (/(marketer|marketing|seo|growth)/i.test(hay)) return "marketers";
	if (/(sales|crm)/i.test(hay)) return "sales teams";
	return "general user";
}

function inferTitle(title: string | null, sourceText: string): string {
	const clean = title?.trim();
	if (clean) return clean;
	const sentence =
		sourceText.match(/^[^.!?\n]{20,120}[.!?]?/)?.[0]?.trim() ?? null;
	if (sentence) return sentence;
	return "Untitled";
}

function inferTrigger(sourceText: string, evidence: string | null): string {
	const hay = evidence ?? sourceText;
	if (/\bwhen\b/i.test(hay)) return clampLen(hay, 160);
	if (/无法|太|慢|贵|问题|困扰|缺少/.test(hay)) return clampLen(`When ${hay}`, 160);
	return "When encountering the described problem or workflow";
}

function inferWorkaround(sourceText: string): string {
	const workaround =
		sourceText.match(/\b(workaround|alternative|alternatives)\b[^.!\n]{0,120}/i)?.[0] ??
		null;
	if (workaround) return clampLen(workaround.trim(), 160);
	return "manual steps or existing tools";
}

function inferPain(title: string | null, evidence: string | null, sourceText: string): string {
	if (evidence) return clampLen(evidence, 180);
	if (title?.trim()) return clampLen(title.trim(), 180);
	return clampLen(sourceText.slice(0, 160).trim() || "Unclear pain point", 180);
}

const DEFAULT_LLM_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_BASE_URL =
	process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
const DEFAULT_DIRECT_TIMEOUT_MS = readIntEnv("FETCH_DIRECT_TIMEOUT_MS", 5_000);
const DEFAULT_JINA_TIMEOUT_MS = readIntEnv("FETCH_JINA_TIMEOUT_MS", 15_000);
const DEFAULT_HN_ITEM_TIMEOUT_MS = readIntEnv("HN_ITEM_TIMEOUT_MS", 3_000);

function getOpenAiKey(): string | null {
	return process.env.OPENAI_API_KEY ?? null;
}

function stripJsonWrapper(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("```")) return trimmed;
	const withoutStart = trimmed.replace(/^```(?:json)?/i, "").trim();
	return withoutStart.replace(/```$/i, "").trim();
}

async function callOpenAiJson(prompt: string, timeoutMs: number): Promise<string> {
	const apiKey = getOpenAiKey();
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY is not set");
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(OPENAI_BASE_URL, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: DEFAULT_LLM_MODEL,
				messages: [
					{
						role: "system",
						content: "Return JSON only. Do not include markdown.",
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.2,
				response_format: { type: "json_object" },
			}),
		});

		if (!res.ok) {
			const detail = await res.text();
			throw new Error(`LLM_HTTP_${res.status}: ${detail}`);
		}
		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content?.trim();
		if (!content) {
			throw new Error("LLM_EMPTY_RESPONSE");
		}
		return content;
	} finally {
		clearTimeout(timeout);
	}
}

async function generateNeedCardWithLlm(input: {
	sourceText: string;
	sourceUrl: string;
	title: string | null;
	timeoutMs: number;
	warnings: WarningEntry[];
	meta: AnalysisMeta;
}): Promise<NeedCardV1 | null> {
	const prompt = buildNeedCardPrompt({
		sourceText: input.sourceText,
		sourceUrl: input.sourceUrl,
		title: input.title,
	});
	const start = Date.now();
	let parseRetry = false;

	try {
		const raw = await callOpenAiJson(prompt, input.timeoutMs);
		let parsed: unknown | null = null;
		let errorMessage: string | null = null;
		try {
			parsed = JSON.parse(stripJsonWrapper(raw));
		} catch (err) {
			errorMessage = String(err);
		}

		let validated = parsed ? NeedCardV1Schema.safeParse(parsed) : null;
		if (!parsed || !validated.success) {
			parseRetry = true;
			const repairPrompt = [
				"Fix the JSON to match the schema exactly. Return JSON only.",
				parsed && !validated?.success ? `Schema error: ${validated.error.message}` : "",
				errorMessage ? `Parse error: ${errorMessage}` : "",
				"Original JSON:",
				parsed ? JSON.stringify(parsed) : raw,
			]
				.filter((line) => line.length > 0)
				.join("\n");
			const repaired = await callOpenAiJson(repairPrompt, input.timeoutMs);
			const parsedRepair = JSON.parse(stripJsonWrapper(repaired));
			const validatedRepair = NeedCardV1Schema.safeParse(parsedRepair);
			if (!validatedRepair.success) {
				addWarning(input.warnings, "LOW_CONFIDENCE", {
					reason: "JSON_PARSE_FAILED",
				});
				input.meta.llm = {
					model: DEFAULT_LLM_MODEL,
					prompt_version: NEED_CARD_PROMPT_VERSION,
					elapsed_ms: Date.now() - start,
					parse_retry: true,
				};
				return null;
			}
			input.meta.llm = {
				model: DEFAULT_LLM_MODEL,
				prompt_version: NEED_CARD_PROMPT_VERSION,
				elapsed_ms: Date.now() - start,
				parse_retry: true,
			};
			return validatedRepair.data;
		}

		input.meta.llm = {
			model: DEFAULT_LLM_MODEL,
			prompt_version: NEED_CARD_PROMPT_VERSION,
			elapsed_ms: Date.now() - start,
			parse_retry: parseRetry || undefined,
		};
		return validated.data;
	} catch (err) {
		addWarning(input.warnings, "LOW_CONFIDENCE", {
			reason: "JSON_PARSE_FAILED",
		});
		input.meta.llm = {
			model: DEFAULT_LLM_MODEL,
			prompt_version: NEED_CARD_PROMPT_VERSION,
			elapsed_ms: Date.now() - start,
			parse_retry: parseRetry || undefined,
		};
		return null;
	}
}

function resolveEvidenceMatch(
	sourceText: string,
	evidenceQuote: string,
): { match: "exact" | "normalized" | "fail"; quote: string | null } {
	if (sourceText.includes(evidenceQuote)) {
		return { match: "exact", quote: evidenceQuote };
	}
	const normalizedSource = normalizeForMatch(sourceText);
	const normalizedQuote = normalizeForMatch(evidenceQuote);
	if (!normalizedQuote) {
		return { match: "fail", quote: null };
	}
	if (normalizedSource.includes(normalizedQuote)) {
		return { match: "normalized", quote: evidenceQuote };
	}
	return { match: "fail", quote: null };
}

function buildFallbackNeedCard(input: {
	title: string | null;
	sourceText: string;
	sourceUrl: string;
}): NeedCardV1 | null {
	const candidate = pickEvidenceQuoteCandidate(input.sourceText);
	const evidenceQuote = ensureEvidenceQuote(input.sourceText, candidate);
	if (!evidenceQuote) return null;

	const draft: NeedCardV1 = {
		kind: "DEMAND",
		title: inferTitle(input.title, input.sourceText),
		who: inferWho(input.sourceText, input.title),
		pain: inferPain(input.title, evidenceQuote, input.sourceText),
		trigger: inferTrigger(input.sourceText, evidenceQuote),
		workaround: inferWorkaround(input.sourceText),
		wtp_signal: inferWtpSignal(input.sourceText),
		evidence_quote: evidenceQuote,
		source_url: input.sourceUrl,
	};

	const parsed = NeedCardV1Schema.safeParse(draft);
	return parsed.success ? parsed.data : null;
}

async function buildHnDiscussionText(params: {
	itemId: number;
	title?: string;
	text?: string;
	kids?: number[];
	includeComments: boolean;
	commentMaxItems: number;
	maxContentChars: number;
	timeoutMs: number;
	signal?: AbortSignal;
	warnings: WarningEntry[];
	meta: AnalysisMeta;
}): Promise<{ text: string; commentCount: number }> {
	const sections: string[] = [];
	const title = params.title?.trim();
	if (title) sections.push(`Title: ${title}`);

	const postText = params.text ? htmlToText(params.text) : "";
	if (postText) sections.push(`Post: ${postText}`);

	const comments: string[] = [];
	let commentErrors = 0;

	if (params.includeComments && params.kids && params.kids.length > 0) {
		const start = Date.now();
		for (const kid of params.kids) {
			if (comments.length >= params.commentMaxItems) break;
			try {
				const comment = await fetchHnItem(kid, {
					timeoutMs: params.timeoutMs,
					signal: params.signal,
				});
				if (comment.deleted || comment.dead) continue;
				const text = comment.text ? htmlToText(comment.text) : "";
				if (!text) continue;
				comments.push(text);
			} catch {
				commentErrors += 1;
			}
		}
		const ms = Date.now() - start;
		params.meta.fetch.attempts.push({
			method: "hn_comment_api",
			ok: commentErrors === 0,
			ms,
			error: commentErrors ? `comment_errors=${commentErrors}` : undefined,
		});
		if (commentErrors > 0) {
			addWarning(params.warnings, "HN_COMMENT_FETCH_FAILED", {
				count: commentErrors,
			});
		}
	}

	if (comments.length > 0) {
		sections.push("Top Comments:");
		sections.push(...comments.map((comment) => `* ${comment}`));
	}

	const combined = sections.join("\n\n").trim();
	return {
		text: clampLen(combined, params.maxContentChars),
		commentCount: comments.length,
	};
}

function generateNeedCardHeuristic(input: {
	title: string | null;
	sourceText: string;
	sourceUrl: string;
}): NeedCardV1 | null {
	return buildFallbackNeedCard({
		title: input.title,
		sourceText: input.sourceText,
		sourceUrl: input.sourceUrl,
	});
}

export async function analyzePipeline(
	url: string,
	options: AnalyzePipelineOptions = {},
): Promise<AnalyzePipelineResult> {
	const totalStart = Date.now();
	const maxContentChars = options.maxContentChars ?? 12_000;
	const extractedLenThreshold = options.extractedLenThreshold ?? 800;
	const legacyFetchTimeoutMs = options.fetchTimeoutMs;
	const directTimeoutMs =
		options.directTimeoutMs ?? legacyFetchTimeoutMs ?? DEFAULT_DIRECT_TIMEOUT_MS;
	const jinaTimeoutMs =
		options.jinaTimeoutMs ?? legacyFetchTimeoutMs ?? DEFAULT_JINA_TIMEOUT_MS;
	const hnItemTimeoutMs = options.hnTimeoutMs ?? DEFAULT_HN_ITEM_TIMEOUT_MS;
	const maxFetchBytes = options.maxFetchBytes ?? 2 * 1024 * 1024;
	const includeComments = options.includeComments ?? false;
	const commentMaxItems = options.commentMaxItems ?? 30;
	const signal = options.signal;

	const warnings: WarningEntry[] = [];
	const meta: AnalysisMeta = {
		fetch: { used: "direct", fallback: false, attempts: [] },
	};
	let lowConfidence = false;

	let urlNormalized: string;
	try {
		urlNormalized = normalizeUrl(url);
	} catch (err) {
		return {
			url,
			url_normalized: url,
			step: "fetched",
			extractor_used: "readability",
			extracted_len: 0,
			title: null,
			source_text: null,
			need_card: null,
			fail_reason: "FETCH_FAILED",
			error: err instanceof Error ? err.message : String(err),
			warnings,
			meta,
			low_confidence: lowConfidence,
		};
	}

	let step: PipelineStep = "fetched";
	let extractorUsed: ExtractorUsed = "readability";
	let title: string | null = null;
	let sourceText: string | null = null;
	let extractedLen = 0;
	let failReason: FailReason | null = null;
	let error: string | null = null;
	let analysisTargetUrl = urlNormalized;
	let hnDiscussionMode = false;
	let directFetchFailed = false;
	let directFetchError: string | null = null;
	let directFetchStatus: number | null = null;
	let directFallbackReason: string | null = null;
	let fetchDuration: number | undefined;
	let hnDuration: number | undefined;
	let llmDuration: number | undefined;

	const recordAttempt = (
		method: string,
		ok: boolean,
		ms: number,
		errorMessage?: string,
	) => {
		meta.fetch.attempts.push({
			method,
			ok,
			ms,
			error: errorMessage,
		});
	};

	const hnId = parseHnItemId(urlNormalized);
	if (hnId) {
		const hnStart = Date.now();
		const resolved = await resolveHnItem(hnId, {
			timeoutMs: hnItemTimeoutMs,
			signal,
		});
		hnDuration = Date.now() - hnStart;
		for (const attempt of resolved.attempts) {
			recordAttempt(attempt.method, attempt.ok, attempt.ms, attempt.error);
			if (!attempt.ok) {
				addWarning(warnings, "FETCH_FAILED", {
					attempt: attempt.method,
					message: attempt.error,
				});
			}
		}

		if (resolved.item) {
			const item = resolved.item;
			if (item.url) {
				analysisTargetUrl = item.url;
				meta.hn = {
					id: hnId,
					kind: "link",
					target_url: item.url,
					fetch: { source: resolved.source, attempts: resolved.attempts },
				};
			} else {
				meta.hn = {
					id: hnId,
					kind: "ask",
					target_url: null,
					fetch: { source: resolved.source, attempts: resolved.attempts },
				};
				meta.fetch.used = "hn_discussion_api";
				meta.fetch.fallback = false;
				extractorUsed = "hn_discussion_api";
				hnDiscussionMode = true;
				title = item.title ?? null;
				const discussionStart = Date.now();
				const discussion = await buildHnDiscussionText({
					itemId: hnId,
					title: item.title,
					text: item.text,
					kids: item.kids,
					includeComments,
					commentMaxItems,
					maxContentChars,
					timeoutMs: hnItemTimeoutMs,
					signal,
					warnings,
					meta,
				});
				fetchDuration = Date.now() - discussionStart;
				sourceText = discussion.text;
				extractedLen = sourceText.length;
				step = "extracted";
			}
			if (resolved.source === "algolia") {
				addWarning(warnings, "HN_FALLBACK", {
					from: "firebase",
					to: "algolia",
					hn_id: hnId,
				});
				console.warn("HN_API_FALLBACK_ALGOLIA", { hn_id: hnId });
			}
		} else {
			meta.hn = {
				id: hnId,
				kind: "unresolved",
				target_url: null,
				fetch: { source: resolved.source, attempts: resolved.attempts },
			};
			addWarning(warnings, "HN_ITEM_FETCH_FAILED", {
				attempt: "hn_item_api",
				message: "both apis failed",
			});
			const errorMessage = "HN item fetch failed";
			captureErrorMeta(meta, new Error(errorMessage));
			applyTiming({ meta, totalStart, hnDuration, fetchDuration });
			return {
				url,
				url_normalized: urlNormalized,
				step,
				extractor_used: extractorUsed,
				extracted_len: extractedLen,
				title,
				source_text: sourceText,
				need_card: null,
				fail_reason: "HN_ITEM_FETCH_FAILED",
				error: errorMessage,
				warnings,
				meta,
				low_confidence: lowConfidence,
			};
		}
	}

	if (!sourceText && !hnDiscussionMode) {
		const fetchStart = Date.now();
		const fetched = await fetchText(analysisTargetUrl, {
			timeoutMs: directTimeoutMs,
			maxBytes: maxFetchBytes,
			signal,
		});
		recordAttempt(
			"direct",
			fetched.ok,
			Date.now() - fetchStart,
			fetched.ok ? undefined : fetched.error,
		);

		if (!fetched.ok) {
			addWarning(
				warnings,
				isTimeoutError(fetched.error) ? "FETCH_TIMEOUT" : "FETCH_FAILED",
				{
					attempt: "direct",
					message: fetched.error,
					status: fetched.status ?? null,
				},
			);
			directFetchFailed = true;
			directFetchError = fetched.error;
			directFetchStatus = fetched.status ?? null;
			directFallbackReason = fetched.status
				? `HTTP_${fetched.status}`
				: "FETCH_FAILED";
		} else {
			step = "fetched";
			const extracted = extractReadability(fetched.text, analysisTargetUrl, {
				maxContentChars,
			});
			if (extracted.ok) {
				title = extracted.title;
				sourceText = extracted.content_text;
				extractedLen = extracted.extracted_len;
				step = "extracted";
				if (extractedLen < extractedLenThreshold) {
					addWarning(warnings, "LIKELY_JS_RENDER", {
						extracted_len: extractedLen,
					});
					directFallbackReason = directFallbackReason ?? "TOO_SHORT";
				}
				const directValidation = validateContent(
					sourceText,
					DIRECT_INVALID_MIN_LEN,
				);
				if (!directValidation.ok) {
					directFetchFailed = true;
					directFetchError = directValidation.reason ?? "INVALID_CONTENT";
					directFallbackReason =
						directFallbackReason ??
						`DIRECT_${directValidation.reason ?? "INVALID_CONTENT"}`;
					sourceText = null;
					extractedLen = 0;
				}
			} else {
				addWarning(warnings, "READABILITY_FAILED", {
					message: extracted.error,
				});
				directFetchFailed = true;
				directFetchError = extracted.error;
				directFallbackReason = "READABILITY_FAILED";
			}
		}

		const shouldFallback =
			!sourceText || extractedLen < extractedLenThreshold || directFetchFailed;

		if (shouldFallback) {
			addWarning(warnings, "FETCH_FALLBACK", {
				from: "direct",
				to: "jina",
				reason: directFallbackReason ?? "low_content",
				status: directFetchStatus ?? undefined,
				message: directFetchError ?? undefined,
			});
			const jinaStart = Date.now();
			const jina = await fetchJinaReaderText(analysisTargetUrl, {
				timeoutMs: jinaTimeoutMs,
				maxBytes: maxFetchBytes,
				maxContentChars,
				signal,
			});
			recordAttempt(
				"jina",
				jina.ok,
				Date.now() - jinaStart,
				jina.ok ? undefined : jina.error,
			);
			meta.fetch.fallback = true;
			meta.fetch.direct_error = directFetchError ?? undefined;
			meta.fetch.direct_status = directFetchStatus ?? undefined;

			if (!jina.ok) {
				if (directFetchFailed || !sourceText) {
					failReason = directFetchFailed ? "FETCH_FAILED" : "JINA_FAILED";
					error = directFetchError ?? jina.error;
					sourceText = null;
					extractedLen = 0;
				}
			} else {
				const jinaValidation = validateContent(
					jina.content_text,
					JINA_INVALID_MIN_LEN,
				);
				if (!jinaValidation.ok) {
					addWarning(warnings, "JINA_INVALID_CONTENT", {
						reason: jinaValidation.reason,
						sample: sampleText(jina.content_text),
					});
					if (directFetchFailed || !sourceText) {
						failReason = "JINA_INVALID_CONTENT";
						error = "JINA_INVALID_CONTENT";
						sourceText = null;
						extractedLen = 0;
					}
				} else {
					meta.fetch.used = "jina";
					extractorUsed = "jina";
					title = title ?? jina.title;
					sourceText = jina.content_text;
					extractedLen = jina.extracted_len;
					step = "extracted";
					if (extractedLen < extractedLenThreshold) {
						addWarning(warnings, "TOO_SHORT", {
							extracted_len: extractedLen,
						});
					}
				}
			}
		} else {
			meta.fetch.used = "direct";
			meta.fetch.fallback = false;
			extractorUsed = "readability";
		}
		fetchDuration = Date.now() - fetchStart;
	}

	if (!sourceText || extractedLen === 0) {
		const finalFailReason = failReason ?? "TOO_SHORT";
		const finalError = error ?? failReason ?? "TOO_SHORT";
		captureErrorMeta(meta, new Error(finalError));
		applyTiming({ meta, totalStart, hnDuration, fetchDuration });
		return {
			url,
			url_normalized: urlNormalized,
			step,
			extractor_used: extractorUsed,
			extracted_len: extractedLen,
			title,
			source_text: sourceText,
			need_card: null,
			fail_reason: finalFailReason,
			error: finalError,
			warnings,
			meta,
			low_confidence: lowConfidence,
		};
	}

	const finalSourceUrl = meta.hn?.target_url ?? analysisTargetUrl;
	const llmResult = await generateNeedCardWithLlm({
		sourceText,
		sourceUrl: finalSourceUrl,
		title,
		timeoutMs: 20_000,
		warnings,
		meta,
	});
	llmDuration = meta.llm?.elapsed_ms;
	let llmFailed = !llmResult;
	let needCard =
		llmResult ??
		generateNeedCardHeuristic({
			title,
			sourceText,
			sourceUrl: finalSourceUrl,
		});

	if (!needCard) {
		captureErrorMeta(meta, new Error("QUOTE_NOT_FOUND"));
		applyTiming({ meta, totalStart, hnDuration, fetchDuration, llmMs: llmDuration });
		return {
			url,
			url_normalized: urlNormalized,
			step,
			extractor_used: extractorUsed,
			extracted_len: extractedLen,
			title,
			source_text: sourceText,
			need_card: null,
			fail_reason: "QUOTE_NOT_FOUND",
			error: "QUOTE_NOT_FOUND",
			warnings,
			meta,
			low_confidence: true,
		};
	}

	if (needCard.source_url !== finalSourceUrl) {
		addWarning(warnings, "SOURCE_URL_MISMATCH", {
			expected: finalSourceUrl,
			actual: needCard.source_url,
		});
		needCard = { ...needCard, source_url: finalSourceUrl };
	}

	if (llmFailed) {
		addWarning(warnings, "LOW_CONFIDENCE", { reason: "LLM_FAILED" });
	}

	const evidenceResult = resolveEvidenceMatch(
		sourceText,
		needCard.evidence_quote,
	);
	let evidenceMatch = evidenceResult.match;
	if (evidenceResult.match === "fail") {
		const fallbackQuote = ensureEvidenceQuote(
			sourceText,
			pickEvidenceQuoteCandidate(sourceText),
		);
		if (!fallbackQuote) {
			addWarning(warnings, "QUOTE_NOT_FOUND");
			captureErrorMeta(meta, new Error("QUOTE_NOT_FOUND"));
			applyTiming({ meta, totalStart, hnDuration, fetchDuration, llmMs: llmDuration });
			return {
				url,
				url_normalized: urlNormalized,
				step,
				extractor_used: extractorUsed,
				extracted_len: extractedLen,
				title,
				source_text: sourceText,
				need_card: null,
				fail_reason: "QUOTE_NOT_FOUND",
				error: "QUOTE_NOT_FOUND",
				warnings,
				meta,
				low_confidence: true,
			};
		}
		needCard = { ...needCard, evidence_quote: fallbackQuote };
		evidenceMatch = "fail";
	}
	meta.evidence = { match: evidenceMatch };

	const guarded = applyLowConfidenceGuard({
		needCard,
		warnings,
		meta,
		evidenceMatch,
	});
	needCard = guarded.needCard;
	lowConfidence = guarded.lowConfidence || llmFailed;

	if (llmFailed && needCard.kind === "DEMAND") {
		needCard = { ...needCard, wtp_signal: downgradeWtp(needCard.wtp_signal) };
	}

	step = "analyzed";
	applyTiming({ meta, totalStart, hnDuration, fetchDuration, llmMs: llmDuration });
	return {
		url,
		url_normalized: urlNormalized,
		step,
		extractor_used: extractorUsed,
		extracted_len: extractedLen,
		title,
		source_text: sourceText,
		need_card: needCard,
		fail_reason: null,
		error: null,
		warnings,
		meta,
		low_confidence: lowConfidence,
	};
}
