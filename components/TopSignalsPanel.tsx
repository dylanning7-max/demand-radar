"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./ui.module.css";
import { AnalysisActionBar } from "./AnalysisActionBar";

type TopSignal = {
	id: string;
	updated_at: string;
	title: string;
	pain_snippet: string;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	low_confidence: boolean;
	source_label: string;
	source_url: string;
	action: "saved" | "ignored" | "watching" | null;
	tags: string[];
	note: string | null;
	action_updated_at: string | null;
};

type ApiResponse = { items: TopSignal[]; error?: string };

const HOURS_OPTIONS = [
	{ label: "24h", value: 24 },
	{ label: "72h", value: 72 },
	{ label: "7d", value: 168 },
];

function parseHours(value: string | null): number {
	const parsed = Number(value);
	if (parsed === 24 || parsed === 72 || parsed === 168) return parsed;
	return 72;
}

function formatRelativeTime(value: string): string {
	const ts = Date.parse(value);
	if (Number.isNaN(ts)) return value;
	const diffMs = Date.now() - ts;
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function getDomain(url: string): string | null {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function badgeClass(wtp: TopSignal["wtp_signal"]) {
	if (wtp === "STRONG") return `${styles.badge} ${styles.badgeStrong}`;
	if (wtp === "MEDIUM" || wtp === "WEAK")
		return `${styles.badge} ${styles.badgeWeak}`;
	return `${styles.badge} ${styles.badgeNone}`;
}

export function TopSignalsPanel() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const hours = useMemo(
		() => parseHours(searchParams.get("signals_hours")),
		[searchParams],
	);
	const showIgnored =
		searchParams.get("show_ignored") === "1" ||
		searchParams.get("show_ignored") === "true";
	const [items, setItems] = useState<TopSignal[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(
					`/api/signals/top?limit=8&hours=${hours}${
						showIgnored ? "&show_ignored=1" : ""
					}`,
				);
				const data = (await res.json()) as ApiResponse;
				if (!res.ok || data.error) {
					throw new Error(data.error ?? "Failed to load signals.");
				}
				if (!alive) return;
				setItems(data.items ?? []);
			} catch (err) {
				if (!alive) return;
				setError(err instanceof Error ? err.message : "Failed to load signals.");
				setItems([]);
			} finally {
				if (alive) setLoading(false);
			}
		};
		load();
		return () => {
			alive = false;
		};
	}, [hours, showIgnored]);

	const handleHoursChange = (value: number) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("signals_hours", String(value));
		router.replace(`/?${params.toString()}`);
	};

	const handleIgnoredToggle = (checked: boolean) => {
		const params = new URLSearchParams(searchParams.toString());
		if (checked) {
			params.set("show_ignored", "1");
		} else {
			params.delete("show_ignored");
		}
		router.replace(`/?${params.toString()}`);
	};

	const updateItemAction = (
		id: string,
		next: { action: "saved" | "ignored" | "watching" | null; tags: string[]; note: string | null },
	) => {
		setItems((prev) => {
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
			<div className={styles.panelHeader}>
				<div>
					<h2 className={styles.cardTitle}>Top Signals</h2>
					<p className={styles.subtext}>DEMAND-only highlights.</p>
				</div>
				<div className={styles.panelActions}>
					<div className={styles.segmented}>
						{HOURS_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								className={`${styles.segmentedButton} ${
									hours === option.value ? styles.segmentedButtonActive : ""
								}`}
								onClick={() => handleHoursChange(option.value)}
							>
								{option.label}
							</button>
						))}
					</div>
					<label className={styles.toggleRow}>
						<input
							type="checkbox"
							checked={showIgnored}
							onChange={(event) => handleIgnoredToggle(event.target.checked)}
						/>
						<span className={styles.value}>Show ignored</span>
					</label>
					<Link href="/history" className={styles.buttonSecondary}>
						View all
					</Link>
				</div>
			</div>

			{error ? <p className={styles.emptyState}>{error}</p> : null}

			{loading ? (
				<div className={styles.list}>
					{Array.from({ length: 6 }).map((_, index) => (
						<div key={index} className={styles.listItem}>
							<div className={styles.skeletonRow}>
								<div className={styles.skeletonBadge} />
								<div className={styles.skeletonBadge} />
							</div>
							<div className={styles.skeletonTitle} />
							<div className={styles.skeletonLine} />
							<div className={styles.skeletonLineShort} />
						</div>
					))}
				</div>
			) : items.length === 0 ? (
				<div className={styles.section}>
					<p className={styles.emptyState}>
						No strong signals in the selected window. Try Pull Now.
					</p>
				</div>
			) : (
				<div className={styles.list}>
					{items.map((item) => {
						const domain = getDomain(item.source_url);
						const isIgnored = item.action === "ignored";
						return (
							<div key={item.id} className={styles.listItem}>
								<div className={styles.badgeRow}>
									{isIgnored ? (
										<span className={`${styles.badge} ${styles.badgeNone}`}>
											IGNORED
										</span>
									) : null}
									<span className={badgeClass(item.wtp_signal)}>
										{item.wtp_signal}
									</span>
									{item.low_confidence ? (
										<span className={`${styles.badge} ${styles.badgeWeak}`}>
											Low Confidence
										</span>
									) : null}
								</div>
								<Link
									href={`/history/${item.id}`}
									className={styles.listTitleLink}
								>
									<h3 className={styles.listTitle}>{item.title}</h3>
								</Link>
								{item.pain_snippet ? (
									<p className={styles.metaLine}>{item.pain_snippet}</p>
								) : null}
								<p className={styles.metaLine}>
									{item.source_label} · {formatRelativeTime(item.updated_at)}
									{domain ? ` · ${domain}` : ""}
								</p>
								<AnalysisActionBar
									analysisId={item.id}
									action={item.action}
									tags={item.tags}
									note={item.note}
									onChange={(next) =>
										updateItemAction(item.id, {
											action: next.action,
											tags: next.tags,
											note: next.note,
										})
									}
								/>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
