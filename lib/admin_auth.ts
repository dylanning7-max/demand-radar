import { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "dr_admin_session";

function parseCookieHeader(header: string | null): Record<string, string> {
	if (!header) return {};
	const out: Record<string, string> = {};
	for (const part of header.split(";")) {
		const [rawKey, ...rest] = part.trim().split("=");
		if (!rawKey) continue;
		out[rawKey] = rest.join("=") ?? "";
	}
	return out;
}

export function isAdminRequest(req: Request): boolean {
	const cookies = parseCookieHeader(req.headers.get("cookie"));
	return cookies[ADMIN_COOKIE_NAME] === "1";
}

export function requireAdmin(req: Request): NextResponse | null {
	if (isAdminRequest(req)) return null;
	return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
