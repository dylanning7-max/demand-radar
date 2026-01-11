ALTER TABLE app_config ADD COLUMN IF NOT EXISTS schedule_enabled boolean;
ALTER TABLE app_config ALTER COLUMN schedule_enabled SET DEFAULT false;
UPDATE app_config SET schedule_enabled = false WHERE schedule_enabled IS NULL;
ALTER TABLE app_config ALTER COLUMN schedule_enabled SET NOT NULL;

ALTER TABLE app_config ADD COLUMN IF NOT EXISTS schedule_interval_minutes integer;
ALTER TABLE app_config ALTER COLUMN schedule_interval_minutes SET DEFAULT 1440;
UPDATE app_config
	SET schedule_interval_minutes = 1440
	WHERE schedule_interval_minutes IS NULL;
ALTER TABLE app_config ALTER COLUMN schedule_interval_minutes SET NOT NULL;

ALTER TABLE app_config ADD COLUMN IF NOT EXISTS max_content_chars integer;
ALTER TABLE app_config ALTER COLUMN max_content_chars SET DEFAULT 12000;
UPDATE app_config SET max_content_chars = 12000 WHERE max_content_chars IS NULL;
ALTER TABLE app_config ALTER COLUMN max_content_chars SET NOT NULL;

ALTER TABLE app_config ADD COLUMN IF NOT EXISTS include_comments boolean;
ALTER TABLE app_config ALTER COLUMN include_comments SET DEFAULT false;
UPDATE app_config SET include_comments = false WHERE include_comments IS NULL;
ALTER TABLE app_config ALTER COLUMN include_comments SET NOT NULL;

ALTER TABLE app_config ADD COLUMN IF NOT EXISTS comment_max_items integer;
ALTER TABLE app_config ALTER COLUMN comment_max_items SET DEFAULT 30;
UPDATE app_config SET comment_max_items = 30 WHERE comment_max_items IS NULL;
ALTER TABLE app_config ALTER COLUMN comment_max_items SET NOT NULL;

ALTER TABLE app_config ADD COLUMN IF NOT EXISTS cron_secret text;
ALTER TABLE app_config ALTER COLUMN cron_secret SET DEFAULT '';
UPDATE app_config SET cron_secret = '' WHERE cron_secret IS NULL;
ALTER TABLE app_config ALTER COLUMN cron_secret SET NOT NULL;

