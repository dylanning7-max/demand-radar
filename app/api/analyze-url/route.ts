import { NextResponse } from "next/server";
import { analyzePipeline } from "../../../lib/analyze_pipeline";
import { getOrCreateConfig } from "../../../lib/config_store";
import { normalizeUrl } from "../../../lib/url_normalize";
import { upsertUrlAnalysis } from "../../../lib/url_analyses_store";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
	url: z.string().min(1),
});

function truncateText(text: string | null, maxChars: number): string | null {
	if (!text) return null;
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars);
}

function validateHttpUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
	try {
		const url = new URL(input);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return { ok: false, error: "Only http/https URLs are supported." };
		}
		return { ok: true, url: input };
	} catch {
		return { ok: false, error: "Invalid URL." };
	}
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
	}

	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body. Expected { url }." }, { status: 400 });
	}

	const rawUrl = parsed.data.url.trim();
	const validation = validateHttpUrl(rawUrl);
	if (!validation.ok) {
		return NextResponse.json({ error: validation.error }, { status: 400 });
	}

	let urlNormalized: string;
	try {
		urlNormalized = normalizeUrl(rawUrl);
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "Invalid URL." },
			{ status: 400 },
		);
	}

	const config = await getOrCreateConfig();
	const maxContentChars = config.max_content_chars ?? 12_000;

	const result = await analyzePipeline(rawUrl, {
		maxContentChars,
		includeComments: config.include_comments,
		commentMaxItems: config.comment_max_items,
	});
	const status = result.need_card ? "success" : "failed";
	const error =
		status === "failed"
			? result.error?.trim() || result.fail_reason || "ANALYSIS_FAILED"
			: null;

	const contentText = truncateText(result.source_text, maxContentChars);

	try {
		const saved = await upsertUrlAnalysis({
			url: rawUrl,
			url_normalized: urlNormalized,
			source_id: null,
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
		return NextResponse.json(saved);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
