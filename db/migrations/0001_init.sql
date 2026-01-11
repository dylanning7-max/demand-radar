CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_config (
	id integer PRIMARY KEY DEFAULT 1,
	schedule_enabled boolean NOT NULL DEFAULT false,
	schedule_interval_minutes integer NOT NULL DEFAULT 1440,
	max_content_chars integer NOT NULL DEFAULT 12000,
	include_comments boolean NOT NULL DEFAULT false,
	comment_max_items integer NOT NULL DEFAULT 30,
	cron_secret text NOT NULL DEFAULT '',
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT app_config_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS url_analyses (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	url text NOT NULL,
	url_normalized text NOT NULL UNIQUE,
	status text NOT NULL,
	step text NOT NULL,
	extractor_used text NOT NULL,
	extracted_len integer NOT NULL,
	fail_reason text,
	content_text text,
	need_card_json jsonb,
	error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS url_analyses_created_at_idx
	ON url_analyses (created_at DESC);

CREATE INDEX IF NOT EXISTS url_analyses_updated_at_idx
	ON url_analyses (updated_at DESC);

