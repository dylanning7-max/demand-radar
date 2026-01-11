CREATE TABLE IF NOT EXISTS sources (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	type text NOT NULL,
	entry_url text NOT NULL,
	enabled boolean NOT NULL DEFAULT true,
	discover_limit integer NOT NULL DEFAULT 20,
	analyze_top_n integer NOT NULL DEFAULT 1,
	last_checked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (type, entry_url)
);

CREATE INDEX IF NOT EXISTS sources_enabled_idx
	ON sources (enabled);

CREATE INDEX IF NOT EXISTS sources_updated_at_idx
	ON sources (updated_at DESC);

ALTER TABLE url_analyses ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE url_analyses
	ADD CONSTRAINT url_analyses_source_id_fkey
	FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS url_analyses_source_id_idx
	ON url_analyses (source_id);

INSERT INTO sources (
	name,
	type,
	entry_url,
	enabled,
	discover_limit,
	analyze_top_n
)
VALUES (
	'HN - Ask',
	'hacker_news',
	'https://hacker-news.firebaseio.com/v0/askstories.json',
	true,
	20,
	1
)
ON CONFLICT (type, entry_url) DO NOTHING;

