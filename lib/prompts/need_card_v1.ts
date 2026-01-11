export const NEED_CARD_PROMPT_VERSION = "need_card_v1";

type NeedCardPromptInput = {
	sourceText: string;
	sourceUrl: string;
	title: string | null;
};

export function buildNeedCardPrompt(input: NeedCardPromptInput): string {
	const title = input.title?.trim() ? input.title.trim() : "Unknown";
	return [
		"You are an analyst. Read the extracted text and return JSON only.",
		"No markdown. No explanations. No extra keys.",
		"",
		"Schema (strict):",
		"{",
		'  "kind": "DEMAND" | "NO_DEMAND",',
		'  "title": string,',
		'  "who": string,',
		'  "pain": string,',
		'  "trigger": string,',
		'  "workaround": string,',
		'  "wtp_signal": "STRONG" | "MEDIUM" | "WEAK" | "NONE",',
		'  "evidence_quote": string (40..240 chars, verbatim substring),',
		'  "source_url": string,',
		'  "tags": string[] (optional, max 5),',
		'  "no_demand_reason": string (only when kind=NO_DEMAND)',
		"}",
		"",
		"Rules:",
		"- evidence_quote must be a verbatim substring from the extracted text.",
		"- If the text is mainly announcements/news/changelog with no actionable pain/workaround,",
		'  set kind="NO_DEMAND", wtp_signal="NONE", and fill no_demand_reason.',
		"- Avoid generic filler in trigger/workaround.",
		"- source_url must equal the provided source URL.",
		"",
		`Source URL: ${input.sourceUrl}`,
		`Page Title: ${title}`,
		"",
		"Extracted Text:",
		"```",
		input.sourceText,
		"```",
		"",
		"Return JSON only.",
	].join("\n");
}
