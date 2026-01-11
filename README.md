# Demand Radar

## Automation (Cron)

- Endpoint: `/api/cron/run`
- Header: `x-cron-secret` (copy from `/config`)
- Config: set `schedule_enabled=true` and choose `schedule_interval_minutes`
- Vercel cron template: `vercel.json` (adjust schedule as needed)

If automation looks stuck, use the **Force Unlock** button on `/config` (requires the same cron secret).
