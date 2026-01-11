# Demand Radar

## Automation (Cron)

- Endpoint: `/api/cron/run`
- Header: `x-cron-secret` (copy from `/config`)
- Config: set `schedule_enabled=true` and choose `schedule_interval_minutes`
- Vercel cron template: `vercel.json` (adjust schedule as needed)

If automation looks stuck, use the **Force Unlock** button on `/config` (requires the same cron secret).

### GitHub Actions cron (Vercel Hobby workaround)

1. Add GitHub repo secrets:
   - `BASE_URL` = `https://<your-deployment-domain>`
   - `CRON_SECRET` = value from `/config` (regenerate if leaked)
2. Workflow file: `.github/workflows/demand-radar-cron.yml`
3. Manual smoke test: GitHub Actions → Demand Radar Cron → Run workflow
4. Verify: `/history` → Jobs shows a new run
