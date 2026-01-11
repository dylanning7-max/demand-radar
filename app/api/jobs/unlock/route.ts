import { NextResponse } from "next/server";
import { getOrCreateConfig } from "../../../../lib/config_store";
import { forceUnlock } from "../../../../lib/jobs/lock";
import { updateAutomationState } from "../../../../lib/stores/automation_state_store";

export const runtime = "nodejs";

export async function POST(req: Request) {
	try {
		const config = await getOrCreateConfig();
		const provided = req.headers.get("x-cron-secret");
		if (!provided || provided !== config.cron_secret) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		await forceUnlock("pull_now");
		await updateAutomationState({
			last_force_unlock_at: new Date().toISOString(),
		});
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
