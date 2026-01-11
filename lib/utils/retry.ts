type RetryOptions = {
	retries?: number;
	backoffMs?: number;
	maxBackoffMs?: number;
	shouldRetry?: (err: unknown) => boolean;
};

const RETRYABLE_CODE_RE = /(ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED)/i;

function defaultShouldRetry(err: unknown): boolean {
	if (err && typeof err === "object" && "status" in err) {
		const status = Number((err as { status?: unknown }).status);
		if (status === 429 || status >= 500) return true;
	}

	if (err instanceof Error) {
		if (err.name === "AbortError") return true;
		if (/timeout|timed out|aborted/i.test(err.message)) return true;
		if (RETRYABLE_CODE_RE.test(err.message)) return true;
	}

	const message = err instanceof Error ? err.message : String(err);
	if (/HTTP\s*429/i.test(message)) return true;
	if (/HTTP\s*5\d\d/i.test(message)) return true;
	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const retries = options.retries ?? 0;
	const backoffMs = options.backoffMs ?? 250;
	const maxBackoffMs = options.maxBackoffMs ?? 1000;
	const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

	let attempt = 0;
	while (true) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= retries || !shouldRetry(err)) {
				throw err;
			}
			const delay = Math.min(backoffMs * 2 ** attempt, maxBackoffMs);
			attempt += 1;
			await sleep(delay);
		}
	}
}
