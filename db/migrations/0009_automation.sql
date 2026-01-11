CREATE TABLE IF NOT EXISTS job_locks (
  lock_name TEXT PRIMARY KEY,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

INSERT INTO job_locks (lock_name)
VALUES ('pull_now')
ON CONFLICT (lock_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS automation_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO automation_state (key, value)
VALUES ('health', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS automation_state_set_updated_at ON automation_state;
CREATE TRIGGER automation_state_set_updated_at
BEFORE UPDATE ON automation_state
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
