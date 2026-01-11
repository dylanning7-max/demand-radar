export function normalizeForMatch(input: string): string {
	let text = input.normalize("NFKC");
	text = text
		.replace(/[\u201c\u201d]/g, '"')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text;
}
