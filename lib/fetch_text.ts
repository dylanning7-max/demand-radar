export type FetchTextOptions = {
	timeoutMs?: number;
	maxBytes?: number;
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

export type FetchTextOk = {
	ok: true;
	url_final: string;
	status: number;
	content_type: string | null;
	text: string;
};

export type FetchTextErr = {
	ok: false;
	error: string;
	status?: number;
	url_final?: string;
};

export type FetchTextResult = FetchTextOk | FetchTextErr;

const CHROME_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseCharset(contentType: string | null): string | null {
	if (!contentType) return null;
	const match = contentType.match(/charset=([^;]+)/i);
	if (!match) return null;
	return match[1]?.trim() ?? null;
}

async function readResponseBodyWithLimit(
	response: Response,
	maxBytes: number,
): Promise<Uint8Array> {
	const contentLength = response.headers.get("content-length");
	if (contentLength) {
		const declared = Number(contentLength);
		if (Number.isFinite(declared) && declared > maxBytes) {
			throw new Error(`Response too large: content-length ${declared} > ${maxBytes}`);
		}
	}

	if (!response.body) {
		const buf = new Uint8Array(await response.arrayBuffer());
		if (buf.byteLength > maxBytes) {
			throw new Error(`Response too large: ${buf.byteLength} > ${maxBytes}`);
		}
		return buf;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			throw new Error(`Response too large: > ${maxBytes} bytes`);
		}
		chunks.push(value);
	}

	const out = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<FetchTextResult> {
	const timeoutMs = options.timeoutMs ?? 12_000;
	const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	let parentAbortHandler: (() => void) | null = null;
	if (options.signal) {
		const handleAbort = () =>
			controller.abort(options.signal?.reason ?? new Error("Aborted"));
		parentAbortHandler = handleAbort;
		if (options.signal.aborted) {
			handleAbort();
		} else {
			options.signal.addEventListener("abort", handleAbort, { once: true });
		}
	}

	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			signal: controller.signal,
			headers: {
				"user-agent": CHROME_UA,
				"accept":
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
				...options.headers,
			},
		});

		if (!res.ok) {
			return {
				ok: false,
				error: `HTTP ${res.status} ${res.statusText}`.trim(),
				status: res.status,
				url_final: res.url,
			};
		}

		const bytes = await readResponseBodyWithLimit(res, maxBytes);
		const contentType = res.headers.get("content-type");
		const charset = parseCharset(contentType);

		let text: string;
		try {
			const decoder = charset ? new TextDecoder(charset) : new TextDecoder("utf-8");
			text = decoder.decode(bytes);
		} catch {
			text = new TextDecoder("utf-8").decode(bytes);
		}

		return {
			ok: true,
			status: res.status,
			url_final: res.url,
			content_type: contentType,
			text,
		};
	} catch (err) {
		const base =
			err instanceof Error ? err.message : `Fetch failed: ${String(err)}`;
		const anyErr = err as unknown as { cause?: unknown };
		const cause =
			typeof err === "object" && err && "cause" in anyErr
				? anyErr.cause instanceof Error
					? anyErr.cause.message
					: String(anyErr.cause)
				: null;
		const message =
			cause && cause !== "undefined" && !base.includes(cause)
				? `${base} (cause: ${cause})`
				: base;
		return { ok: false, error: message };
	} finally {
		clearTimeout(timeout);
		if (options.signal && parentAbortHandler) {
			options.signal.removeEventListener("abort", parentAbortHandler);
		}
	}
}
