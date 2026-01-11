const TRACKING_PARAM_EXACT = new Set([
	"gclid",
	"fbclid",
	"yclid",
	"msclkid",
	"igshid",
	"mc_cid",
	"mc_eid",
]);

function isTrackingParam(name: string): boolean {
	const lower = name.toLowerCase();
	if (lower.startsWith("utm_")) return true;
	return TRACKING_PARAM_EXACT.has(lower);
}

export function normalizeUrl(input: string): string {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Only http/https URLs are supported: ${input}`);
	}

	url.hash = "";

	const filtered = new URLSearchParams();
	for (const [key, value] of url.searchParams.entries()) {
		if (isTrackingParam(key)) continue;
		if (value.trim() === "") continue;
		filtered.append(key, value);
	}

	const sorted = new URLSearchParams();
	const entries = Array.from(filtered.entries()).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	for (const [key, value] of entries) sorted.append(key, value);
	url.search = sorted.toString();

	if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
		url.pathname = url.pathname.slice(0, -1);
	}

	if (url.port === "80" && url.protocol === "http:") url.port = "";
	if (url.port === "443" && url.protocol === "https:") url.port = "";

	return url.toString();
}
