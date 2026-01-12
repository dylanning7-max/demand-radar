export type NeedCardDTO = {
	kind: "DEMAND" | "NO_DEMAND";
	intent_type?: "TOOL_DEMAND" | "DISCUSSION" | "CONSUMER" | "OTHER";
	title: string;
	who?: string;
	pain?: string;
	trigger?: string;
	workaround?: string;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	evidence_quote?: string | null;
	source_url: string;
	tags?: string[];
	no_demand_reason?: string;
	scores?: {
		pain: number;
		intent: number;
		workaround: number;
		audience: number;
		wtp: number;
		risk: number;
		uncertainty: number;
	};
	evidence?: {
		pain_quote: string | null;
		workaround_quote: string | null;
		ask_quote: string | null;
	};
	evidence_hits?: number;
	opportunity_score?: number;
	next_action?: string[];
	score_notes?: Partial<Record<
		"pain" | "intent" | "workaround" | "audience" | "wtp" | "risk" | "uncertainty",
		string
	>>;
};

export type UrlAnalysisDTO = {
	id: string;
	url: string;
	url_normalized: string;
	source_id?: string | null;
	status: "success" | "failed";
	step: "fetched" | "extracted" | "analyzed";
	extractor_used: "readability" | "jina" | "hn_discussion_api";
	extracted_len: number;
	fail_reason: string | null;
	need_card_json: NeedCardDTO | null;
	warnings?: unknown[];
	meta?: Record<string, unknown>;
	low_confidence?: boolean;
	updated_at: string;
	created_at: string;
	error: string | null;
	action?: "saved" | "ignored" | "watching" | null;
	tags?: string[];
	note?: string | null;
	action_updated_at?: string | null;
};

export type JobRunDTO = {
	id: string;
	job_name: string;
	trigger: "manual" | "cron";
	status: "running" | "success" | "failed";
	started_at: string;
	finished_at: string | null;
	log: string | null;
	error: string | null;
};

export type ConfigDTO = {
	id: number;
	schedule_enabled: boolean;
	schedule_interval_minutes: number;
	max_content_chars: number;
	max_per_run: number;
	include_comments: boolean;
	comment_max_items: number;
	cron_secret: string;
	updated_at: string;
};
