import { fetchText } from "./fetch_text";

export type JinaReaderOptions = {
	timeoutMs?: number;
	maxBytes?: number;
	maxContentChars?: number;
	signal?: AbortSignal;
};

export type JinaReaderOk = {
	ok: true;
	title: string | null;
	content_text: string;
	extracted_len: number;
};

export type JinaReaderErr = {
	ok: false;
	error: string;
};

export type JinaReaderResult = JinaReaderOk | JinaReaderErr;

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

function inferTitleFromJinaText(text: string): string | null {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, 10);

	for (const line of lines) {
		if (line.startsWith("#")) {
			const t = line.replace(/^#+\s*/, "").trim();
			if (t) return t.slice(0, 200);
		}
		if (line.toLowerCase().startsWith("title:")) {
			const t = line.slice("title:".length).trim();
			if (t) return t.slice(0, 200);
		}
	}
	return null;
}

export async function fetchJinaReaderText(
	url: string,
	options: JinaReaderOptions = {},
): Promise<JinaReaderResult> {
	const timeoutMs = options.timeoutMs ?? 12_000;
	const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
	const maxContentChars = options.maxContentChars ?? 12_000;

	const jinaUrl = `https://r.jina.ai/${url}`;
	const res = await fetchText(jinaUrl, {
		timeoutMs,
		maxBytes,
		headers: {
			accept: "text/plain,*/*;q=0.8",
			"user-agent": "Mozilla/5.0 (compatible; demand-radar/0.1; +https://example.com)",
		},
		signal: options.signal,
	});
	if (!res.ok) return { ok: false, error: res.error };

	const cleaned = truncateText(cleanText(res.text), maxContentChars);
	return {
		ok: true,
		title: inferTitleFromJinaText(cleaned),
		content_text: cleaned,
		extracted_len: cleaned.length,
	};
}
