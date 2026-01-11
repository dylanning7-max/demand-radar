import { NextResponse } from "next/server";
import { getAnalysisById } from "../../../../lib/stores/analyses_store";

export const runtime = "nodejs";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const cleaned = id?.trim();
	if (!cleaned) {
		return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	}

	try {
		const analysis = await getAnalysisById(cleaned);
		if (!analysis) {
			return NextResponse.json({ error: "Not found." }, { status: 404 });
		}
		return NextResponse.json(analysis);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
