CREATE TABLE IF NOT EXISTS job_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	job_name text NOT NULL,
	trigger text NOT NULL CHECK (trigger IN ('manual', 'cron')),
	status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
	started_at timestamptz NOT NULL DEFAULT now(),
	finished_at timestamptz,
	log text,
	error text
);

CREATE INDEX IF NOT EXISTS job_runs_started_at_idx
	ON job_runs (started_at DESC);

