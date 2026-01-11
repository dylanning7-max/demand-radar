CREATE TABLE IF NOT EXISTS analysis_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES url_analyses(id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN ('saved', 'ignored', 'watching')),
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (analysis_id)
);

CREATE INDEX IF NOT EXISTS analysis_actions_action_idx ON analysis_actions(action);
CREATE INDEX IF NOT EXISTS analysis_actions_updated_at_idx ON analysis_actions(updated_at DESC);
CREATE INDEX IF NOT EXISTS analysis_actions_tags_gin_idx ON analysis_actions USING GIN(tags);

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

DROP TRIGGER IF EXISTS analysis_actions_set_updated_at ON analysis_actions;
CREATE TRIGGER analysis_actions_set_updated_at
BEFORE UPDATE ON analysis_actions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
