"use client";

import { useEffect, useState } from "react";
import styles from "../ui.module.css";
import { InlineAlert } from "../InlineAlert";
import { AnalysisResultCard } from "../AnalysisResultCard";
import { JobRunStatusCard } from "../JobRunStatusCard";
import { JobRunDTO, UrlAnalysisDTO } from "../../lib/dto";

type ApiError = { error?: string };

async function readJsonSafe<T>(res: Response): Promise<T | null> {
	try {
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

export function JobDebugger() {
	const [latest, setLatest] = useState<UrlAnalysisDTO | null>(null);
	const [jobRun, setJobRun] = useState<JobRunDTO | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		const loadLatest = async () => {
			try {
				const res = await fetch("/api/analyses/latest");
				if (res.status === 401) {
					window.location.href = "/admin/login";
					return;
				}
				if (!res.ok) {
					const data = await readJsonSafe<ApiError>(res);
					setError(data?.error ?? "Failed to load latest analysis.");
					return;
				}
				const data = await readJsonSafe<UrlAnalysisDTO | null>(res);
				if (!alive) return;
				setLatest(data);
			} catch (err) {
				if (!alive) return;
				setError(err instanceof Error ? err.message : "Failed to load latest analysis.");
			}
		};
		const loadJob = async () => {
			try {
				const res = await fetch("/api/jobs/latest");
				if (res.status === 401) {
					window.location.href = "/admin/login";
					return;
				}
				if (!res.ok) {
					return;
				}
				const data = await readJsonSafe<JobRunDTO | null>(res);
				if (!alive) return;
				setJobRun(data);
			} catch {
				return;
			}
		};
		loadLatest();
		loadJob();
		return () => {
			alive = false;
		};
	}, []);

	return (
		<section className={styles.section}>
			{error ? <InlineAlert type="error" message={error} /> : null}

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
