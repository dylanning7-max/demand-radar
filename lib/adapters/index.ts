import { SourceAdapter, SourceType } from "./base";
import { HackerNewsAdapter } from "./hacker-news";

export function getAdapter(type: SourceType): SourceAdapter {
	switch (type) {
		case "hacker_news":
			return new HackerNewsAdapter();
		default:
			throw new Error(`Unsupported source type: ${type}`);
	}
}

