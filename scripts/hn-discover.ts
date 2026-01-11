import { pool } from "../lib/db";
import { getAdapter } from "../lib/adapters";
import { SourceRow } from "../lib/adapters/base";

async function main() {
	const res = await pool.query<SourceRow>(
		"SELECT * FROM sources WHERE type = 'hacker_news' ORDER BY created_at ASC LIMIT 1",
	);
	const source = res.rows[0];
	if (!source) {
		console.error("No hacker_news source found. Run migrations first.");
		process.exit(1);
	}

	const adapter = getAdapter(source.type);
	const results = await adapter.discover(source);

	const top = results.slice(0, 5);
	for (const item of top) {
		console.log(`${item.url} | ${item.origin_title ?? ""}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
