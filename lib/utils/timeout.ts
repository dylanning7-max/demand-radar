function toAbortMessage(reason: unknown, fallback: string): string {
	if (reason instanceof Error && reason.message) return reason.message;
	if (typeof reason === "string" && reason.trim().length > 0) return reason;
	if (reason != null) return String(reason);
	return fallback;
}

function toAbortError(message: string, cause?: unknown): Error {
	const err = new Error(message);
	err.name = "AbortError";
	if (cause !== undefined) {
		(err as { cause?: unknown }).cause = cause;
	}
	return err;
}

export async function withTimeout<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	parentSignal?: AbortSignal,
): Promise<T> {
	const controller = new AbortController();
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let parentAbortHandler: (() => void) | null = null;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			const err = toAbortError(`Timeout after ${timeoutMs}ms`);
			controller.abort(err);
			reject(err);
		}, timeoutMs);
	});

	const parentPromise =
		parentSignal
			? new Promise<never>((_, reject) => {
					const onAbort = () => {
						const message = toAbortMessage(
							parentSignal.reason,
							"Operation aborted",
						);
						const err = toAbortError(message, parentSignal.reason);
						controller.abort(err);
						reject(err);
					};
					parentAbortHandler = onAbort;
					if (parentSignal.aborted) {
						onAbort();
					} else {
						parentSignal.addEventListener("abort", onAbort, { once: true });
					}
				})
			: null;

	try {
		const race = parentPromise
			? Promise.race([fn(controller.signal), timeoutPromise, parentPromise])
			: Promise.race([fn(controller.signal), timeoutPromise]);
		return await race;
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
		if (parentSignal && parentAbortHandler) {
			parentSignal.removeEventListener("abort", parentAbortHandler);
		}
	}
}
