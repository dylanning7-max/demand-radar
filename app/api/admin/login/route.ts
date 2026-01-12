import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "../../../../lib/admin_auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
	}

	const key = typeof (body as { key?: unknown })?.key === "string"
		? (body as { key: string }).key.trim()
		: "";
	const expected = process.env.ADMIN_KEY;
	if (!expected) {
		return NextResponse.json(
			{ ok: false, error: "ADMIN_KEY is not set." },
			{ status: 500 },
		);
	}
	if (!key || key !== expected) {
		return NextResponse.json({ ok: false, error: "Invalid key." }, { status: 401 });
	}

	const res = NextResponse.json({ ok: true });
	res.cookies.set({
		name: ADMIN_COOKIE_NAME,
		value: "1",
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
	return res;
}
