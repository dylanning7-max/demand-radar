import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

export type ExtractReadabilityOptions = {
	maxContentChars?: number;
};

export type ExtractReadabilityOk = {
	ok: true;
	title: string | null;
	content_text: string;
	extracted_len: number;
};

export type ExtractReadabilityErr = {
	ok: false;
	error: string;
};

export type ExtractReadabilityResult = ExtractReadabilityOk | ExtractReadabilityErr;

function cleanText(text: string): string {
	return text
		.replace(/\u00a0/g, " ")
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars);
}

export function extractReadability(
	html: string,
	url: string,
	options: ExtractReadabilityOptions = {},
): ExtractReadabilityResult {
	const maxContentChars = options.maxContentChars ?? 12_000;

	try {
		const virtualConsole = new VirtualConsole();
		virtualConsole.on("error", () => {});
		const dom = new JSDOM(html, { url, virtualConsole });
		const document = dom.window.document;
		document
			.querySelectorAll("script, style, noscript, template")
			.forEach((el) => el.remove());

		const reader = new Readability(document);
		const article = reader.parse();
		const title = article?.title?.trim() ? article.title.trim() : null;
		const textContent = article?.textContent?.trim() ? article.textContent : null;
		if (!textContent) return { ok: false, error: "READABILITY_EMPTY" };

		const cleaned = truncateText(cleanText(textContent), maxContentChars);
		return {
			ok: true,
			title,
			content_text: cleaned,
			extracted_len: cleaned.length,
		};
	} catch (err) {
		const message =
			err instanceof Error ? err.message : `Readability failed: ${String(err)}`;
		return { ok: false, error: message };
	}
}
