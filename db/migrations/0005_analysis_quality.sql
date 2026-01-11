ALTER TABLE url_analyses
	ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE url_analyses
	ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE url_analyses
	ADD COLUMN IF NOT EXISTS low_confidence boolean NOT NULL DEFAULT false;

