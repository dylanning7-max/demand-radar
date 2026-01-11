export type SourceType = "hacker_news";

export type SourceRow = {
	id: string;
	name: string;
	type: SourceType;
	entry_url: string;
	enabled: boolean;
	discover_limit: number;
	analyze_top_n: number;
};

export type DiscoveryResult = {
	source_id: string;
	url: string;
	origin_title?: string | null;
	origin_id?: string | null;
};

export interface SourceAdapter {
	discover(source: SourceRow): Promise<DiscoveryResult[]>;
}

