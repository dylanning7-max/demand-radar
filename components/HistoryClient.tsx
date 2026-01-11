"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./ui.module.css";
import { InlineAlert } from "./InlineAlert";
import { AnalysisActionBar } from "./AnalysisActionBar";

type NeedCardSummary = {
	kind: "DEMAND" | "NO_DEMAND" | "UNKNOWN";
	title: string;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	low_confidence: boolean;
};

type AnalysisListItem = {
	id: string;
	updated_at: string;
	source_url: string;
	source_label: string | null;
	status: "success" | "failed";
	need_card_summary: NeedCardSummary;
	action: "saved" | "ignored" | "watching" | null;
	tags: string[];
	note: string | null;
	action_updated_at: string | null;
};

type JobStats = {
	discovered: number;
	deduped_new: number;
	deduped_existing: number;
	analyzed: number;
	failed: number;
};

type JobMetaStats = {
	total: number;
	success: number;
	failed: number;
	hn_fallback: number;
	fetch_fallback: number;
	jina_invalid: number;
	timebox_exceeded: number;
};

type JobListItem = {
	id: string;
	started_at: string;
	finished_at: string | null;
	trigger: "manual" | "cron";
	status: "success" | "failed";
	error: string | null;
	log: string | null;
	stats: JobStats;
	meta_stats: JobMetaStats | null;
};

type ApiListResponse<T> = { items: T[]; next_cursor: string | null; error?: string };

function formatDate(value: string | null | undefined): string {
	if (!value) return "--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function badgeClass(value: NeedCardSummary["wtp_signal"]) {
	if (value === "STRONG") return `${styles.badge} ${styles.badgeStrong}`;
	if (value === "MEDIUM" || value === "WEAK")
		return `${styles.badge} ${styles.badgeWeak}`;
	return `${styles.badge} ${styles.badgeNone}`;
}

function normalizeWtp(value: NeedCardSummary["wtp_signal"]): NeedCardSummary["wtp_signal"] {
	const normalized = String(value ?? "").toUpperCase();
	if (normalized === "STRONG") return "STRONG";
	if (normalized === "MEDIUM") return "MEDIUM";
	if (normalized === "WEAK") return "WEAK";
	return "NONE";
}

function wtpRank(value: NeedCardSummary["wtp_signal"]): number {
	switch (normalizeWtp(value)) {
		case "STRONG":
			return 0;
		case "MEDIUM":
			return 1;
		case "WEAK":
			return 2;
		default:
			return 3;
	}
}

function sortAnalyses(items: AnalysisListItem[]): AnalysisListItem[] {
	return [...items].sort((a, b) => {
		const aKindRank =
			a.status === "failed"
				? 2
				: a.need_card_summary.kind === "DEMAND"
					? 0
					: a.need_card_summary.kind === "NO_DEMAND"
						? 1
						: 2;
		const bKindRank =
			b.status === "failed"
				? 2
				: b.need_card_summary.kind === "DEMAND"
					? 0
					: b.need_card_summary.kind === "NO_DEMAND"
						? 1
						: 2;
		if (aKindRank !== bKindRank) return aKindRank - bKindRank;

		const aLow = a.need_card_summary.low_confidence ? 1 : 0;
		const bLow = b.need_card_summary.low_confidence ? 1 : 0;
		if (aLow !== bLow) return aLow - bLow;

		const aWtp = wtpRank(a.need_card_summary.wtp_signal);
		const bWtp = wtpRank(b.need_card_summary.wtp_signal);
		if (aWtp !== bWtp) return aWtp - bWtp;

		const aTime = Date.parse(a.updated_at);
		const bTime = Date.parse(b.updated_at);
		if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return bTime - aTime;
		return String(b.updated_at).localeCompare(String(a.updated_at));
	});
}

export function HistoryClient() {
	const [tab, setTab] = useState<"analyses" | "jobs">("analyses");
	const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
	const [analysesCursor, setAnalysesCursor] = useState<string | null>(null);
	const [jobs, setJobs] = useState<JobListItem[]>([]);
	const [jobsCursor, setJobsCursor] = useState<string | null>(null);
	const [loadingAnalyses, setLoadingAnalyses] = useState(false);
	const [loadingJobs, setLoadingJobs] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const searchParams = useSearchParams();
	const showAll = searchParams.get("show") === "all";
	const showIgnored =
		searchParams.get("show_ignored") === "1" ||
		searchParams.get("show_ignored") === "true";

	const loadAnalyses = async (reset = false) => {
		if (loadingAnalyses) return;
		setLoadingAnalyses(true);
		setError(null);
		const cursor = reset ? null : analysesCursor;
		try {
			const res = await fetch(
				`/api/analyses?limit=20${cursor ? `&cursor=${cursor}` : ""}${
					showIgnored ? "&show_ignored=1" : ""
				}`,
			);
			const data = (await res.json()) as ApiListResponse<AnalysisListItem>;
			if (!res.ok || data.error) {
				setError(data.error ?? "Failed to load analyses.");
				return;
			}
			setAnalyses((prev) => (reset ? data.items : [...prev, ...data.items]));
			setAnalysesCursor(data.next_cursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load analyses.");
		} finally {
			setLoadingAnalyses(false);
		}
	};

	const loadJobs = async (reset = false) => {
		if (loadingJobs) return;
		setLoadingJobs(true);
		setError(null);
		const cursor = reset ? null : jobsCursor;
		try {
			const res = await fetch(
				`/api/jobs?limit=20${cursor ? `&cursor=${cursor}` : ""}`,
			);
			const data = (await res.json()) as ApiListResponse<JobListItem>;
			if (!res.ok || data.error) {
				setError(data.error ?? "Failed to load jobs.");
				return;
			}
			setJobs((prev) => (reset ? data.items : [...prev, ...data.items]));
			setJobsCursor(data.next_cursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load jobs.");
		} finally {
			setLoadingJobs(false);
		}
	};

	useEffect(() => {
		loadAnalyses(true);
	}, []);

	useEffect(() => {
		setAnalyses([]);
		setAnalysesCursor(null);
		loadAnalyses(true);
	}, [showIgnored]);

	useEffect(() => {
		if (tab === "jobs" && jobs.length === 0) {
			loadJobs(true);
		}
	}, [tab]);

	const filteredAnalyses = useMemo(() => {
		if (showAll) return analyses;
		return analyses.filter(
			(item) =>
				item.status === "success" &&
				item.need_card_summary.kind === "DEMAND",
		);
	}, [analyses, showAll]);

	const sortedAnalyses = useMemo(
		() => sortAnalyses(filteredAnalyses),
		[filteredAnalyses],
	);

	const handleToggle = (checked: boolean) => {
		const params = new URLSearchParams(searchParams.toString());
		if (checked) {
			params.set("show", "all");
		} else {
			params.delete("show");
		}
		const query = params.toString();
		router.replace(query ? `/history?${query}` : "/history");
	};

	const handleIgnoredToggle = (checked: boolean) => {
		const params = new URLSearchParams(searchParams.toString());
		if (checked) {
			params.set("show_ignored", "1");
		} else {
			params.delete("show_ignored");
		}
		const query = params.toString();
		router.replace(query ? `/history?${query}` : "/history");
	};

	const updateAnalysisAction = (
		id: string,
		next: { action: "saved" | "ignored" | "watching" | null; tags: string[]; note: string | null },
	) => {
		setAnalyses((prev) => {
			const updated = prev.map((item) =>
				item.id === id
					? {
							...item,
							action: next.action,
							tags: next.action ? next.tags : [],
							note: next.action ? next.note : null,
						}
					: item,
			);
			if (showIgnored) return updated;
			return updated.filter((item) => item.action !== "ignored");
		});
	};

	return (
		<section className={styles.section}>
			<div className={styles.tabs}>
				<button
					type="button"
					className={`${styles.tabButton} ${
						tab === "analyses" ? styles.tabButtonActive : ""
					}`}
					onClick={() => setTab("analyses")}
				>
					Analyses
				</button>
				<button
					type="button"
					className={`${styles.tabButton} ${
						tab === "jobs" ? styles.tabButtonActive : ""
					}`}
					onClick={() => setTab("jobs")}
				>
					Jobs
				</button>
				{tab === "analyses" ? (
					<>
						<label className={styles.toggleRow}>
							<input
								type="checkbox"
								checked={showAll}
								onChange={(event) => handleToggle(event.target.checked)}
							/>
							<span className={styles.value}>Show NO_DEMAND</span>
						</label>
						<label className={styles.toggleRow}>
							<input
								type="checkbox"
								checked={showIgnored}
								onChange={(event) => handleIgnoredToggle(event.target.checked)}
							/>
							<span className={styles.value}>Show ignored</span>
						</label>
					</>
				) : null}
			</div>

			{error ? <InlineAlert type="error" message={error} /> : null}

			{tab === "analyses" ? (
				<div className={styles.list}>
					{sortedAnalyses.length === 0 && !loadingAnalyses ? (
						<div className={styles.section}>
							<p className={styles.emptyState}>
								{showAll ? "No analyses yet." : "No demand signals yet."}
							</p>
							{!showAll ? (
								<p className={styles.hint}>
									Toggle "Show NO_DEMAND" to reveal all analyses.
								</p>
							) : null}
							<Link className={styles.buttonSecondary} href="/">
								Run Pull Now
							</Link>
						</div>
					) : null}
					{sortedAnalyses.map((item) => {
						const summary = item.need_card_summary;
						const isFailed = item.status === "failed";
						const isNoDemand =
							item.status === "success" && summary.kind === "NO_DEMAND";
						const isIgnored = item.action === "ignored";
						const rowClass = isFailed
							? `${styles.listItem} ${styles.listItemError}`
							: isNoDemand
								? `${styles.listItem} ${styles.listItemMuted}`
								: styles.listItem;

						return (
							<div key={item.id} className={rowClass}>
								<div className={styles.badgeRow}>
									{isFailed ? (
										<span className={`${styles.badge} ${styles.badgeError}`}>
											ERROR
										</span>
									) : null}
									{isNoDemand ? (
										<span className={`${styles.badge} ${styles.badgeNone}`}>
											NO DEMAND
										</span>
									) : null}
									{isIgnored ? (
										<span className={`${styles.badge} ${styles.badgeNone}`}>
											IGNORED
										</span>
									) : null}
									{!isFailed && !isNoDemand ? (
										<span className={badgeClass(summary.wtp_signal)}>
											{summary.wtp_signal}
										</span>
									) : null}
									{summary.low_confidence ? (
										<span className={`${styles.badge} ${styles.badgeWeak}`}>
											Low Confidence
										</span>
									) : null}
								</div>
								<Link href={`/history/${item.id}`} className={styles.listTitleLink}>
									<h3 className={styles.listTitle}>
										{isNoDemand ? "No Demand Detected" : summary.title}
									</h3>
								</Link>
								{isNoDemand && summary.title !== "No Demand Detected" ? (
									<p className={styles.metaLine}>Title: {summary.title}</p>
								) : null}
								<p className={styles.metaLine}>
									{item.source_label ?? "Manual"} · {formatDate(item.updated_at)}
								</p>
								<p className={styles.metaLine}>{item.source_url}</p>
								<AnalysisActionBar
									analysisId={item.id}
									action={item.action}
									tags={item.tags}
									note={item.note}
									onChange={(next) =>
										updateAnalysisAction(item.id, {
											action: next.action,
											tags: next.tags,
											note: next.note,
										})
									}
								/>
							</div>
						);
					})}
					{analysesCursor ? (
						<button
							type="button"
							className={styles.buttonSecondary}
							disabled={loadingAnalyses}
							onClick={() => loadAnalyses(false)}
						>
							{loadingAnalyses ? "Loading..." : "Load more"}
						</button>
					) : null}
				</div>
			) : (
				<div className={styles.list}>
					{jobs.length === 0 && !loadingJobs ? (
						<p className={styles.emptyState}>No job runs yet.</p>
					) : null}
					{jobs.map((job) => (
						<div key={job.id} className={styles.listItem}>
							<div className={styles.badgeRow}>
								<span className={styles.statusBadge}>{job.status}</span>
								<span className={styles.badge}>
									{job.trigger.toUpperCase()}
								</span>
								{job.meta_stats?.failed ? (
									<span className={`${styles.badge} ${styles.badgeError}`}>
										{job.meta_stats.failed} Failed
									</span>
								) : null}
								{job.meta_stats?.fetch_fallback ? (
									<span className={`${styles.badge} ${styles.badgeWeak}`}>
										Fallback Active
									</span>
								) : null}
								{job.meta_stats?.hn_fallback ? (
									<span className={`${styles.badge} ${styles.badgeInfo}`}>
										Algolia Used
									</span>
								) : null}
								{job.meta_stats?.jina_invalid ? (
									<span className={`${styles.badge} ${styles.badgeWarn}`}>
										Jina Invalid
									</span>
								) : null}
							</div>
							<h3 className={styles.listTitle}>
								{formatDate(job.started_at)} → {formatDate(job.finished_at)}
							</h3>
							<p className={styles.metaLine}>
								{job.meta_stats
									? `Total ${job.meta_stats.total} | Success ${job.meta_stats.success} | Failed ${job.meta_stats.failed} | Fetch fallback ${job.meta_stats.fetch_fallback} | Algolia ${job.meta_stats.hn_fallback} | Jina invalid ${job.meta_stats.jina_invalid} | Timebox ${job.meta_stats.timebox_exceeded}`
									: "Stats -"}
							</p>
							<p className={styles.metaLine}>
								discovered {job.stats.discovered} | deduped_new{" "}
								{job.stats.deduped_new} | analyzed {job.stats.analyzed} | failed{" "}
								{job.stats.failed}
							</p>
							{job.status === "failed" && job.error ? (
								<p className={styles.metaLine}>error: {job.error}</p>
							) : null}
							{job.log ? (
								<details className={styles.details}>
									<summary className={styles.label}>Log</summary>
									<pre className={styles.blockquote}>{job.log}</pre>
								</details>
							) : null}
						</div>
					))}
					{jobsCursor ? (
						<button
							type="button"
							className={styles.buttonSecondary}
							disabled={loadingJobs}
							onClick={() => loadJobs(false)}
						>
							{loadingJobs ? "Loading..." : "Load more"}
						</button>
					) : null}
				</div>
			)}
		</section>
	);
}
