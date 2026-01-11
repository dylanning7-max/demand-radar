"use client";

import styles from "./ui.module.css";
import { JobRunDTO } from "../lib/dto";

type JobRunStatusCardProps = {
	title: string;
	job: JobRunDTO;
};

function formatDate(value: string | null): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function JobRunStatusCard({ title, job }: JobRunStatusCardProps) {
	return (
		<section className={styles.card}>
			<div className={styles.cardHeader}>
				<h2 className={styles.cardTitle}>{title}</h2>
				<span className={styles.statusBadge}>{job.status}</span>
			</div>
			<div className={styles.detailsGrid}>
				<div className={styles.detailsItem}>trigger: {job.trigger}</div>
				<div className={styles.detailsItem}>started_at: {formatDate(job.started_at)}</div>
				<div className={styles.detailsItem}>
					finished_at: {formatDate(job.finished_at)}
				</div>
				<div className={styles.detailsItem}>error: {job.error ?? "—"}</div>
			</div>
			{job.log ? (
				<details className={styles.details}>
					<summary className={styles.label}>Log</summary>
					<pre className={styles.blockquote}>{job.log}</pre>
				</details>
			) : null}
		</section>
	);
}
