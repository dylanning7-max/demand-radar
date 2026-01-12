"use client";

import { useEffect, useState } from "react";
import styles from "../ui.module.css";
import { InlineAlert } from "../InlineAlert";
import { Spinner } from "../Spinner";

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

type ApiError = { error?: string };

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

export function SystemHealth() {
	const [health, setHealth] = useState<AutomationHealth | null>(null);
	const [healthError, setHealthError] = useState<string | null>(null);
	const [healthLoading, setHealthLoading] = useState(true);

	useEffect(() => {
		let alive = true;
		const loadHealth = async () => {
			setHealthLoading(true);
			setHealthError(null);
			try {
				const res = await fetch("/api/automation/health");
				if (res.status === 401) {
					window.location.href = "/admin/login";
					return;
				}
				const data = (await res.json()) as AutomationHealth | ApiError;
				if (!res.ok || (data as ApiError).error) {
					setHealthError(
						(data as ApiError).error ?? "Failed to load automation health.",
					);
					return;
				}
				if (!alive) return;
				setHealth(data as AutomationHealth);
			} catch (err) {
				if (!alive) return;
				setHealthError(
					err instanceof Error ? err.message : "Failed to load automation health.",
				);
			} finally {
				if (alive) setHealthLoading(false);
			}
		};
		loadHealth();
		return () => {
			alive = false;
		};
	}, []);

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
		</section>
	);
}
