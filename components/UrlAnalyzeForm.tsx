"use client";

import { FormEvent, useState } from "react";
import styles from "./ui.module.css";
import { Spinner } from "./Spinner";

type UrlAnalyzeFormProps = {
	onAnalyze: (url: string) => Promise<void>;
	onPullNow?: () => Promise<void>;
	initialUrl?: string;
	loading: boolean;
	pullLoading?: boolean;
};

export function UrlAnalyzeForm({
	onAnalyze,
	onPullNow,
	initialUrl,
	loading,
	pullLoading,
}: UrlAnalyzeFormProps) {
	const [value, setValue] = useState(initialUrl ?? "");

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const url = value.trim();
		if (!url || loading) return;
		await onAnalyze(url);
	};

	return (
		<form onSubmit={handleSubmit} className={styles.card}>
			<div className={styles.formRow}>
				<input
					className={styles.input}
					type="url"
					placeholder="https://example.com/article"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					disabled={loading}
					required
				/>
				<button
					className={styles.button}
					type="submit"
					disabled={loading || value.trim().length === 0}
				>
					{loading ? (
						<>
							<span style={{ marginRight: 8 }}>Analyzing</span>
							<Spinner />
						</>
					) : (
						"Analyze"
					)}
				</button>
				{onPullNow ? (
					<button
						className={styles.buttonSecondary}
						type="button"
						onClick={() => onPullNow()}
						disabled={loading || pullLoading}
					>
						{pullLoading ? (
							<>
								<span style={{ marginRight: 8 }}>Pulling</span>
								<Spinner />
							</>
						) : (
							"Pull Now"
						)}
					</button>
				) : null}
			</div>
		</form>
	);
}
