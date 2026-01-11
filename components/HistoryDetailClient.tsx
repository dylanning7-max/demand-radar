"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ui.module.css";
import { AnalysisResultCard } from "./AnalysisResultCard";
import type { UrlAnalysisDTO } from "../lib/dto";
import { InlineAlert } from "./InlineAlert";

type ApiError = { error?: string };

export function HistoryDetailClient({ id }: { id: string }) {
	const [analysis, setAnalysis] = useState<UrlAnalysisDTO | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!id || id === "undefined") {
			setError("Invalid analysis id.");
			setLoading(false);
			return;
		}
		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`/api/analyses/${id}`);
				const data = (await res.json()) as UrlAnalysisDTO | ApiError;
				const apiError =
					!res.ok && typeof (data as ApiError).error === "string"
						? (data as ApiError).error
						: null;
				if (apiError) {
					setError(apiError);
					return;
				}
				setAnalysis(data as UrlAnalysisDTO);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load analysis.");
			} finally {
				setLoading(false);
			}
		};
		load();
	}, [id]);

	return (
		<section className={styles.section}>
			<div className={styles.toolbar}>
				<Link href="/history" className={styles.buttonSecondary}>
					Back to History
				</Link>
			</div>
			{error ? <InlineAlert type="error" message={error} /> : null}
			{loading ? (
				<p className={styles.emptyState}>Loading analysis...</p>
			) : analysis ? (
				<AnalysisResultCard title="Analysis Detail" analysis={analysis} />
			) : (
				<p className={styles.emptyState}>No analysis found.</p>
			)}
		</section>
	);
}
