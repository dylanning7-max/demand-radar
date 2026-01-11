"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./ui.module.css";
import { AnalysisActionBar } from "./AnalysisActionBar";

type SavedItem = {
	id: string;
	title: string;
	source_url: string;
	evidence_quote: string | null;
	wtp_signal: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
	action: "saved" | "watching";
	tags: string[];
	note: string | null;
	action_updated_at: string;
};

type ApiResponse = { items: SavedItem[]; error?: string };

function formatDate(value: string | null | undefined): string {
	if (!value) return "--";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function badgeClass(value: SavedItem["wtp_signal"]) {
	if (value === "STRONG") return `${styles.badge} ${styles.badgeStrong}`;
	if (value === "MEDIUM" || value === "WEAK")
		return `${styles.badge} ${styles.badgeWeak}`;
	return `${styles.badge} ${styles.badgeNone}`;
}

function buildExport(items: SavedItem[]): string {
	const date = new Date().toISOString().slice(0, 10);
	const lines: string[] = [`# Demand Radar Export - ${date}`, ""];

	for (const item of items) {
		lines.push(`## ${item.title}`);
		lines.push(`- Signal: ${item.wtp_signal}`);
		lines.push(`- Source: ${item.source_url}`);
		lines.push(`- Tags: ${item.tags.length > 0 ? item.tags.join(", ") : "-"}`);
		lines.push(`- Note: ${item.note ?? "-"}`);
		lines.push(`- Saved At: ${item.action_updated_at ?? "-"}`);
		lines.push("");
		lines.push(`> ${item.evidence_quote ?? "-"}`);
		lines.push("");
		lines.push("---");
		lines.push("");
	}

	return lines.join("\n");
}

function downloadMarkdown(content: string) {
	const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "demand-radar-saved.md";
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export function SavedClient() {
	const [items, setItems] = useState<SavedItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [tagFilter, setTagFilter] = useState<string>("");

	useEffect(() => {
		let alive = true;
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch("/api/saved");
				const data = (await res.json()) as ApiResponse;
				if (!res.ok || data.error) {
					throw new Error(data.error ?? "Failed to load saved items.");
				}
				if (!alive) return;
				setItems(data.items ?? []);
			} catch (err) {
				if (!alive) return;
				setError(err instanceof Error ? err.message : "Failed to load saved items.");
				setItems([]);
			} finally {
				if (alive) setLoading(false);
			}
		};
		load();
		return () => {
			alive = false;
		};
	}, []);

	const uniqueTags = useMemo(() => {
		const set = new Set<string>();
		for (const item of items) {
			for (const tag of item.tags ?? []) {
				set.add(tag);
			}
		}
		return Array.from(set).sort();
	}, [items]);

	const filteredItems = useMemo(() => {
		if (!tagFilter) return items;
		return items.filter((item) => item.tags?.includes(tagFilter));
	}, [items, tagFilter]);

	const handleExport = () => {
		const content = buildExport(filteredItems);
		downloadMarkdown(content);
	};

	const updateItemAction = (
		id: string,
		next: { action: "saved" | "ignored" | "watching" | null; tags: string[]; note: string | null },
	) => {
		setItems((prev) => {
			if (next.action !== "saved" && next.action !== "watching") {
				return prev.filter((item) => item.id !== id);
			}
			return prev.map((item) =>
				item.id === id
					? {
							...item,
							action: next.action,
							tags: next.tags,
							note: next.note,
						}
					: item,
			);
		});
	};

	return (
		<section className={styles.section}>
			<div className={styles.panelHeader}>
				<div>
					<h2 className={styles.cardTitle}>Saved Signals</h2>
					<p className={styles.subtext}>Your curated backlog.</p>
				</div>
				<div className={styles.panelActions}>
					{uniqueTags.length > 0 ? (
						<select
							className={styles.input}
							value={tagFilter}
							onChange={(event) => setTagFilter(event.target.value)}
						>
							<option value="">All tags</option>
							{uniqueTags.map((tag) => (
								<option key={tag} value={tag}>
									{tag}
								</option>
							))}
						</select>
					) : null}
					<button
						type="button"
						className={styles.buttonSecondary}
						onClick={handleExport}
						disabled={filteredItems.length === 0}
					>
						Export Markdown
					</button>
					<Link href="/history" className={styles.buttonSecondary}>
						View History
					</Link>
				</div>
			</div>

			{error ? <p className={styles.emptyState}>{error}</p> : null}

			{loading ? (
				<p className={styles.emptyState}>Loading saved items...</p>
			) : filteredItems.length === 0 ? (
				<p className={styles.emptyState}>No saved signals yet.</p>
			) : (
				<div className={styles.list}>
					{filteredItems.map((item) => (
						<div key={item.id} className={styles.listItem}>
							<div className={styles.badgeRow}>
								<span className={badgeClass(item.wtp_signal)}>
									{item.wtp_signal}
								</span>
								<span className={`${styles.badge} ${styles.badgeInfo}`}>
									{item.action.toUpperCase()}
								</span>
							</div>
							<Link href={`/history/${item.id}`} className={styles.listTitleLink}>
								<h3 className={styles.listTitle}>{item.title}</h3>
							</Link>
							<p className={styles.metaLine}>{item.source_url}</p>
							<p className={styles.metaLine}>
								Saved at {formatDate(item.action_updated_at)}
							</p>
							{item.tags.length > 0 ? (
								<p className={styles.metaLine}>Tags: {item.tags.join(", ")}</p>
							) : null}
							{item.note ? (
								<p className={styles.metaLine}>Note: {item.note}</p>
							) : null}
							{item.evidence_quote ? (
								<blockquote className={styles.blockquote}>
									{item.evidence_quote}
								</blockquote>
							) : null}
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
					))}
				</div>
			)}
		</section>
	);
}
