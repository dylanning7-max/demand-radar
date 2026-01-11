"use client";

import styles from "./ui.module.css";
import type { NeedCardDTO, UrlAnalysisDTO } from "../lib/dto";
import { AnalysisActionBar } from "./AnalysisActionBar";

type AnalysisResultCardProps = {
	title: string;
	analysis: UrlAnalysisDTO;
};

function formatDate(value: string | null | undefined): string {
	if (!value) return "--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function badgeClass(wtp: NeedCardDTO["wtp_signal"]) {
	const normalized = String(wtp).toUpperCase();
	if (normalized === "STRONG") return `${styles.badge} ${styles.badgeStrong}`;
	if (normalized === "MEDIUM" || normalized === "WEAK")
		return `${styles.badge} ${styles.badgeWeak}`;
	return `${styles.badge} ${styles.badgeNone}`;
}

export function AnalysisResultCard({ title, analysis }: AnalysisResultCardProps) {
	const needCard = analysis.need_card_json;
	const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
	const metaFetch = (analysis.meta as { fetch?: { used?: string; fallback?: boolean } })
		?.fetch;
	const metaHn = (analysis.meta as {
		hn?: { kind?: string; target_url?: string | null };
	})?.hn;
	const metaEvidence = (analysis.meta as { evidence?: { match?: string } })
		?.evidence;
	const isNoDemand = needCard?.kind === "NO_DEMAND";
	const tags = Array.isArray(analysis.tags) ? analysis.tags : [];

	return (
		<section className={styles.card}>
			<div className={styles.cardHeader}>
				<h2 className={styles.cardTitle}>{title}</h2>
				<div className={styles.badgeRow}>
					{isNoDemand ? (
						<span className={`${styles.badge} ${styles.badgeNone}`}>
							NO DEMAND
						</span>
					) : null}
					{analysis.low_confidence ? (
						<span className={`${styles.badge} ${styles.badgeWeak}`}>
							Low Confidence
						</span>
					) : null}
					<span className={styles.statusBadge}>{analysis.status}</span>
				</div>
			</div>

			<AnalysisActionBar
				analysisId={analysis.id}
				action={analysis.action ?? null}
				tags={tags}
				note={analysis.note ?? null}
			/>

			{needCard ? (
				<>
					<p className={styles.pain}>
						{isNoDemand ? needCard.no_demand_reason : needCard.pain}
					</p>
					<div className={styles.grid}>
						<div className={styles.field}>
							<div className={styles.label}>Title</div>
							<div className={styles.value}>{needCard.title ?? "--"}</div>
						</div>
						{needCard.kind === "DEMAND" ? (
							<>
								<div className={styles.field}>
									<div className={styles.label}>Who</div>
									<div className={styles.value}>{needCard.who}</div>
								</div>
								<div className={styles.field}>
									<div className={styles.label}>Trigger</div>
									<div className={styles.value}>{needCard.trigger}</div>
								</div>
								<div className={styles.field}>
									<div className={styles.label}>Workaround</div>
									<div className={styles.value}>{needCard.workaround}</div>
								</div>
							</>
						) : null}
					</div>

					<div className={styles.section}>
						<div className={styles.label}>WTP signal</div>
						<span className={badgeClass(needCard.wtp_signal)}>
							{needCard.wtp_signal}
						</span>
					</div>

					{tags.length > 0 ? (
						<div className={styles.section}>
							<div className={styles.label}>Tags</div>
							<p className={styles.metaLine}>{tags.join(", ")}</p>
						</div>
					) : null}
					{analysis.note ? (
						<div className={styles.section}>
							<div className={styles.label}>Note</div>
							<p className={styles.metaLine}>{analysis.note}</p>
						</div>
					) : null}

					{needCard.evidence_quote ? (
						<blockquote className={styles.blockquote}>
							{needCard.evidence_quote}
						</blockquote>
					) : (
						<p className={styles.emptyState}>No evidence quote.</p>
					)}
					{metaEvidence?.match === "normalized" ? (
						<p className={styles.hint}>Evidence normalized match.</p>
					) : null}

					<div className={styles.section}>
						<div className={styles.label}>Source</div>
						<a
							className={styles.link}
							href={needCard.source_url}
							target="_blank"
							rel="noreferrer"
						>
							{needCard.source_url}
						</a>
					</div>
				</>
			) : (
				<p className={styles.emptyState}>No Need Card available for this analysis.</p>
			)}

			<details className={styles.details}>
				<summary className={styles.label}>Debug</summary>
				<div className={styles.detailsGrid}>
					<div className={styles.detailsItem}>extractor_used: {analysis.extractor_used}</div>
					<div className={styles.detailsItem}>extracted_len: {analysis.extracted_len}</div>
					<div className={styles.detailsItem}>
						fail_reason: {analysis.fail_reason ?? "--"}
					</div>
					<div className={styles.detailsItem}>status: {analysis.status}</div>
					<div className={styles.detailsItem}>updated_at: {formatDate(analysis.updated_at)}</div>
					<div className={styles.detailsItem}>
						url_normalized: {analysis.url_normalized}
					</div>
					<div className={styles.detailsItem}>step: {analysis.step}</div>
					<div className={styles.detailsItem}>error: {analysis.error ?? "--"}</div>
					<div className={styles.detailsItem}>
						meta.fetch.used: {metaFetch?.used ?? "--"}
					</div>
					<div className={styles.detailsItem}>
						meta.fetch.fallback:{" "}
						{metaFetch?.fallback === undefined
							? "--"
							: metaFetch.fallback
								? "true"
								: "false"}
					</div>
					<div className={styles.detailsItem}>
						meta.hn.kind: {metaHn?.kind ?? "--"}
					</div>
					<div className={styles.detailsItem}>
						meta.hn.target_url: {metaHn?.target_url ?? "--"}
					</div>
				</div>
				{warnings.length > 0 ? (
					<div className={styles.section}>
						<div className={styles.label}>Warnings</div>
						<ul className={styles.warningList}>
							{warnings.map((warning, index) => (
								<li key={index}>{JSON.stringify(warning)}</li>
							))}
						</ul>
					</div>
				) : (
					<p className={styles.emptyState}>No warnings.</p>
				)}
			</details>
		</section>
	);
}
