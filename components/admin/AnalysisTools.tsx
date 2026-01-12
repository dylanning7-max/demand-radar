"use client";

import { useState } from "react";
import styles from "../ui.module.css";
import { UrlAnalyzeForm } from "../UrlAnalyzeForm";
import { AnalysisResultCard } from "../AnalysisResultCard";
import { InlineAlert } from "../InlineAlert";
import { JobRunDTO, UrlAnalysisDTO } from "../../lib/dto";

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

export function AnalysisTools() {
	const [result, setResult] = useState<UrlAnalysisDTO | null>(null);
	const [loading, setLoading] = useState(false);
	const [jobLoading, setJobLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [jobError, setJobError] = useState<string | null>(null);

	const handleAnalyze = async (url: string) => {
		setError(null);
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
			if (res.status === 401) {
				window.location.href = "/admin/login";
				return;
			}
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
		} catch (err) {
			setError(err instanceof Error ? err.message : "Request failed.");
		} finally {
			setLoading(false);
		}
	};

	const handlePullNow = async () => {
		setJobError(null);
		setJobLoading(true);
		try {
			const res = await fetch("/api/jobs/pull-now", { method: "POST" });
			if (res.status === 401) {
				window.location.href = "/admin/login";
				return;
			}
			const data = await readJsonSafe<JobRunDTO | ApiError>(res);
			if (!res.ok) {
				setJobError((data as ApiError | null)?.error ?? `Pull Now failed (${res.status}).`);
				return;
			}
			if (!data) {
				setJobError("Empty response from server.");
				return;
			}
		} catch (err) {
			setJobError(err instanceof Error ? err.message : "Pull Now failed.");
		} finally {
			setJobLoading(false);
		}
	};

	return (
		<section className={styles.section}>
			<UrlAnalyzeForm
				onAnalyze={handleAnalyze}
				onPullNow={handlePullNow}
				loading={loading}
				pullLoading={jobLoading}
			/>
			{error ? <InlineAlert type="error" message={error} /> : null}
			{jobError ? <InlineAlert type="error" message={jobError} /> : null}

			<div className={styles.section}>
				{result ? (
					<AnalysisResultCard title="Result" analysis={result} />
				) : (
					<p className={styles.emptyState}>No result yet. Analyze a URL to see output.</p>
				)}
			</div>
		</section>
	);
}
