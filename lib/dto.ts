export type DemandNeedCardDTO = {
	kind: "DEMAND";
	title: string;
	who: string;
	pain: string;
	trigger: string;
	workaround: string;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	evidence_quote: string;
	source_url: string;
	tags?: string[];
};

export type NoDemandNeedCardDTO = {
	kind: "NO_DEMAND";
	title: string;
	no_demand_reason: string;
	wtp_signal: "NONE";
	evidence_quote: string;
	source_url: string;
	tags?: string[];
	who?: string;
	pain?: string;
	trigger?: string;
	workaround?: string;
};

export type NeedCardDTO = DemandNeedCardDTO | NoDemandNeedCardDTO;

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
