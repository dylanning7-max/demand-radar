import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

type GlobalWithPg = typeof globalThis & { __pgPool?: Pool };
const globalForPg = globalThis as GlobalWithPg;

export const pool =
	globalForPg.__pgPool ??
	new Pool({
		connectionString,
		max: 5,
		idleTimeoutMillis: 30_000,
	});

if (!globalForPg.__pgPool) {
	globalForPg.__pgPool = pool;
}

