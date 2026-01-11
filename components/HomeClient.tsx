"use client";

import { useEffect, useState } from "react";
import styles from "./ui.module.css";
import { UrlAnalyzeForm } from "./UrlAnalyzeForm";
import { AnalysisResultCard } from "./AnalysisResultCard";
import { InlineAlert } from "./InlineAlert";
import { JobRunStatusCard } from "./JobRunStatusCard";
import { Spinner } from "./Spinner";
import { JobRunDTO, UrlAnalysisDTO } from "../lib/dto";

type ApiError = { error?: string };

function isValidUrl(value: string): boolean {
	return value.startsWith("http://") || value.startsWith("https://");
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
	try {
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

type AutomationHealth = {
	schedule_enabled: boolean;
	interval_minutes: number;
	last_cron_hit_at: string | null;
	last_job_started_at: string | null;
	lock: { is_locked: boolean; expires_at: string | null; locked_by: string | null };
	health: "healthy" | "warning" | "bad" | "stale" | "disabled" | "running";
	reasons: string[];
	recent: { lookback_runs: number; avg_fail_rate: number; avg_fallback_rate: number };
};

function formatDateTime(value: string | null | undefined): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function healthBadgeClass(status: AutomationHealth["health"]): string {
	if (status === "healthy") return `${styles.badge} ${styles.badgeInfo}`;
	if (status === "warning") return `${styles.badge} ${styles.badgeWarn}`;
	if (status === "bad" || status === "stale")
		return `${styles.badge} ${styles.badgeError}`;
	return `${styles.badge} ${styles.badgeNone}`;
}

function formatPercent(value: number): string {
	if (!Number.isFinite(value)) return "—";
	return `${Math.round(value * 100)}%`;
}

export function HomeClient() {
	const [latest, setLatest] = useState<UrlAnalysisDTO | null>(null);
	const [result, setResult] = useState<UrlAnalysisDTO | null>(null);
	const [loading, setLoading] = useState(false);
	const [jobLoading, setJobLoading] = useState(false);
	const [jobRun, setJobRun] = useState<JobRunDTO | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [jobError, setJobError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [health, setHealth] = useState<AutomationHealth | null>(null);
	const [healthError, setHealthError] = useState<string | null>(null);
	const [healthLoading, setHealthLoading] = useState(true);

	useEffect(() => {
		const loadLatest = async () => {
			try {
				const res = await fetch("/api/analyses/latest");
				if (!res.ok) {
					const data = await readJsonSafe<ApiError>(res);
					setInfo(data?.error ?? "Failed to load latest analysis.");
					return;
				}
				const data = await readJsonSafe<UrlAnalysisDTO | null>(res);
				setInfo(null);
				setLatest(data);
			} catch (err) {
				setInfo(err instanceof Error ? err.message : "Failed to load latest analysis.");
			}
		};
		const loadJob = async () => {
			try {
				const res = await fetch("/api/jobs/latest");
				if (!res.ok) {
					return;
				}
				const data = await readJsonSafe<JobRunDTO | null>(res);
				setJobRun(data);
			} catch {
				return;
			}
		};
		const loadHealth = async () => {
			try {
				const res = await fetch("/api/automation/health");
				const data = await readJsonSafe<AutomationHealth | ApiError>(res);
				if (!res.ok || !data || "error" in (data as ApiError)) {
					setHealthError(
						(data as ApiError | null)?.error ?? "Failed to load automation health.",
					);
					return;
				}
				setHealth(data as AutomationHealth);
			} catch (err) {
				setHealthError(
					err instanceof Error ? err.message : "Failed to load automation health.",
				);
			} finally {
				setHealthLoading(false);
			}
		};
		loadLatest();
		loadJob();
		loadHealth();
	}, []);

	const handleAnalyze = async (url: string) => {
		setError(null);
		setInfo(null);
		setJobError(null);
		if (!isValidUrl(url)) {
			setError("URL must start with http:// or https://");
			return;
		}
		setLoading(true);
		try {
			const res = await fetch("/api/analyze-url", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url }),
			});
			const data = await readJsonSafe<UrlAnalysisDTO | ApiError>(res);
			if (!res.ok) {
				setError((data as ApiError | null)?.error ?? `Request failed (${res.status}).`);
				return;
			}
			if (!data) {
				setError("Empty response from server.");
				return;
			}
			setResult(data as UrlAnalysisDTO);
			setLatest(data as UrlAnalysisDTO);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Request failed.");
		} finally {
			setLoading(false);
		}
	};

	const handlePullNow = async () => {
		setJobError(null);
		setInfo(null);
		setJobLoading(true);
		try {
			const res = await fetch("/api/jobs/pull-now", { method: "POST" });
			const data = await readJsonSafe<JobRunDTO | ApiError>(res);
			if (!res.ok) {
				setJobError((data as ApiError | null)?.error ?? `Pull Now failed (${res.status}).`);
				return;
			}
			if (!data) {
				setJobError("Empty response from server.");
				return;
			}
			setJobRun(data as JobRunDTO);

			const latestRes = await fetch("/api/analyses/latest");
			if (latestRes.ok) {
				const latestData = await readJsonSafe<UrlAnalysisDTO | null>(
					latestRes,
				);
				setLatest(latestData);
			}
		} catch (err) {
			setJobError(err instanceof Error ? err.message : "Pull Now failed.");
		} finally {
			setJobLoading(false);
		}
	};

	const healthHints: string[] = [];
	if (health?.reasons?.includes("STALE_NO_RECENT_JOB")) {
		healthHints.push("Cron not hitting — check Vercel Cron config / secret.");
	}
	if (health?.reasons?.includes("FAIL_RATE_HIGH")) {
		healthHints.push("Fail rate high — see Jobs.");
	}
	if (health?.reasons?.includes("FALLBACK_RATE_HIGH")) {
		healthHints.push("Fallback rate high — anti-bot pressure.");
	}

	return (
		<section className={styles.section}>
			<div className={styles.section}>
				{healthError ? <InlineAlert type="error" message={healthError} /> : null}
				<section className={styles.card}>
					<div className={styles.cardHeader}>
						<h2 className={styles.cardTitle}>System Health</h2>
						<span className={health ? healthBadgeClass(health.health) : styles.badge}>
							{health ? health.health : "loading"}
						</span>
					</div>
					{healthLoading ? (
						<div className={styles.formRow}>
							<span className={styles.value}>Loading health</span>
							<Spinner />
						</div>
					) : health ? (
						<>
							<div className={styles.detailsGrid}>
								<div className={styles.detailsItem}>
									enabled: {health.schedule_enabled ? "yes" : "no"}
								</div>
								<div className={styles.detailsItem}>
									interval: {health.interval_minutes}m
								</div>
								<div className={styles.detailsItem}>
									last cron hit: {formatDateTime(health.last_cron_hit_at)}
								</div>
								<div className={styles.detailsItem}>
									last job started: {formatDateTime(health.last_job_started_at)}
								</div>
								<div className={styles.detailsItem}>
									lock: {health.lock.is_locked ? "locked" : "free"}
								</div>
								<div className={styles.detailsItem}>
									lock expires: {formatDateTime(health.lock.expires_at)}
								</div>
								<div className={styles.detailsItem}>
									avg fail rate: {formatPercent(health.recent.avg_fail_rate)}
								</div>
								<div className={styles.detailsItem}>
									avg fallback rate: {formatPercent(health.recent.avg_fallback_rate)}
								</div>
							</div>
							{healthHints.length > 0 ? (
								<div className={styles.section}>
									{healthHints.map((hint) => (
										<p key={hint} className={styles.hint}>
											{hint}
										</p>
									))}
								</div>
							) : null}
						</>
					) : (
						<p className={styles.emptyState}>No health data yet.</p>
					)}
				</section>
			</div>

			<UrlAnalyzeForm
				onAnalyze={handleAnalyze}
				onPullNow={handlePullNow}
				loading={loading}
				pullLoading={jobLoading}
			/>
			{error ? <InlineAlert type="error" message={error} /> : null}
			{info ? <InlineAlert type="info" message={info} /> : null}
			{jobError ? <InlineAlert type="error" message={jobError} /> : null}

			<div className={styles.section}>
				{result ? (
					<AnalysisResultCard title="Result" analysis={result} />
				) : (
					<p className={styles.emptyState}>No result yet. Analyze a URL to see output.</p>
				)}
			</div>

			<div className={styles.section}>
				{jobRun ? (
					<JobRunStatusCard title="Last job" job={jobRun} />
				) : (
					<p className={styles.emptyState}>No job runs yet.</p>
				)}
			</div>

			<div className={styles.section}>
				{latest ? (
					<AnalysisResultCard title="Latest analysis" analysis={latest} />
				) : (
					<p className={styles.emptyState}>No analyses yet.</p>
				)}
			</div>
		</section>
	);
}
