import { analyzePipeline } from "../lib/analyze_pipeline";

async function main() {
	const url = process.argv.slice(2).find((arg) => arg !== "--");
	if (!url) {
		console.error("Usage: tsx scripts/analyze-url.ts <url>");
		process.exit(1);
	}

	const result = await analyzePipeline(url);

	console.log(`url_normalized: ${result.url_normalized}`);
	console.log(`extractor_used: ${result.extractor_used}`);
	console.log(`extracted_len: ${result.extracted_len}`);
	console.log(`fail_reason: ${result.fail_reason ?? ""}`);
	if (result.error) console.log(`error: ${result.error}`);
	console.log("");

	if (!result.need_card) {
		console.log("Need Card: null");
		process.exit(1);
	}

	console.log(JSON.stringify(result.need_card, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
