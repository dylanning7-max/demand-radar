import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

async function ensureMigrationsTable(client: Client) {
	await client.query(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		);
	`);
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
	const res = await client.query<{ id: string }>("SELECT id FROM _migrations");
	return new Set(res.rows.map((row) => row.id));
}

async function applyMigration(
	client: Client,
	id: string,
	sql: string,
): Promise<void> {
	await client.query("BEGIN");
	try {
		await client.query(sql);
		await client.query("INSERT INTO _migrations (id) VALUES ($1)", [id]);
		await client.query("COMMIT");
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	}
}

async function main() {
	const connectionString =
		process.env.DIRECT_URL || process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DIRECT_URL or DATABASE_URL is required to run migrations.");
	}

	const migrationsDir = join(process.cwd(), "db", "migrations");
	const files = (await readdir(migrationsDir))
		.filter((file) => file.endsWith(".sql"))
		.sort();

	const client = new Client({ connectionString });
	await client.connect();
	try {
		await ensureMigrationsTable(client);
		const applied = await getAppliedMigrations(client);

		for (const file of files) {
			if (applied.has(file)) continue;
			const sql = await readFile(join(migrationsDir, file), "utf8");
			await applyMigration(client, file, sql);
			console.log(`Applied migration: ${file}`);
		}
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

