import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "../../../../lib/admin_auth";

export const runtime = "nodejs";

export async function POST() {
	const res = NextResponse.json({ ok: true });
	res.cookies.set({
		name: ADMIN_COOKIE_NAME,
		value: "",
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		maxAge: 0,
	});
	return res;
}
