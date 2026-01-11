import { NextResponse } from "next/server";
import { z } from "zod";
import {
	deleteAnalysisAction,
	upsertAnalysisAction,
} from "../../../lib/stores/analysis_actions_store";

export const runtime = "nodejs";

const ActionSchema = z.union([
	z.literal("saved"),
	z.literal("ignored"),
	z.literal("watching"),
]);

const BodySchema = z.object({
	analysis_id: z.string().uuid(),
	action: ActionSchema.nullable(),
	tags: z.array(z.string()).optional(),
	note: z.string().optional().nullable(),
});

function normalizeTags(tags: string[] | undefined): string[] {
	if (!tags) return [];
	const normalized = tags
		.map((tag) => tag.trim().toLowerCase())
		.filter((tag) => tag.length > 0);
	const trimmed = normalized.map((tag) => tag.slice(0, 24));
	return Array.from(new Set(trimmed)).slice(0, 8);
}

function normalizeNote(note: string | null | undefined): string | null {
	if (note == null) return null;
	const trimmed = note.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, 280);
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
	}

	const parsed = BodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues.map((issue) => issue.message).join(", ");
		return NextResponse.json({ error: message || "Invalid payload." }, { status: 400 });
	}

	const payload = parsed.data;
	const tags = normalizeTags(payload.tags);
	const note = normalizeNote(payload.note);

	try {
		if (payload.action === null) {
			await deleteAnalysisAction(payload.analysis_id);
			return NextResponse.json({
				analysis_id: payload.analysis_id,
				action: null,
				tags: [],
				note: null,
			});
		}

		const row = await upsertAnalysisAction({
			analysis_id: payload.analysis_id,
			action: payload.action,
			tags,
			note,
		});
		return NextResponse.json(row);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
