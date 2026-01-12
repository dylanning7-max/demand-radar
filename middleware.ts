import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME } from "./lib/admin_auth";

function hasAdminSession(req: NextRequest): boolean {
	return req.cookies.get(ADMIN_COOKIE_NAME)?.value === "1";
}

function isPublicAsset(pathname: string): boolean {
	return (
		pathname.startsWith("/_next/") ||
		pathname === "/favicon.ico" ||
		pathname === "/robots.txt"
	);
}

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;
	if (isPublicAsset(pathname)) {
		return NextResponse.next();
	}

	const isAdmin = hasAdminSession(req);

	if (pathname.startsWith("/admin/login")) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/admin") || pathname.startsWith("/config")) {
		if (!isAdmin) {
			const url = req.nextUrl.clone();
			url.pathname = "/admin/login";
			return NextResponse.redirect(url);
		}
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/admin/login") || pathname.startsWith("/api/admin/logout")) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/cron/run")) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/analyses")) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/signals")) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/saved")) {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/jobs") && req.method === "GET") {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/config") && req.method === "GET") {
		return NextResponse.next();
	}

	if (pathname.startsWith("/api/")) {
		if (!isAdmin) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
