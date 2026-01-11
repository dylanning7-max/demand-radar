"use client";

import { useEffect, useState } from "react";
import styles from "./ui.module.css";
import { InlineAlert } from "./InlineAlert";
import { Spinner } from "./Spinner";

type ConfigState = {
	schedule_enabled: boolean;
	schedule_interval_minutes: string;
	max_content_chars: string;
	max_per_run: string;
	include_comments: boolean;
	comment_max_items: string;
	cron_secret: string;
	updated_at?: string;
};

type ApiError = { error?: string };

const DEFAULT_CONFIG: ConfigState = {
	schedule_enabled: false,
	schedule_interval_minutes: "1440",
	max_content_chars: "12000",
	max_per_run: "5",
	include_comments: false,
	comment_max_items: "30",
	cron_secret: "",
};

function parseNumber(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateSecret(lengthBytes = 24): string {
	const bytes = new Uint8Array(lengthBytes);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes);
}

export function ConfigClient() {
	const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [revealSecret, setRevealSecret] = useState(false);
	const [unlocking, setUnlocking] = useState(false);

	useEffect(() => {
		const loadConfig = async () => {
			try {
				const res = await fetch("/api/config");
				const data = (await res.json()) as ConfigState | ApiError;
				if (!res.ok || "error" in data) {
					setError(data.error ?? "Failed to load config.");
					return;
				}
				setConfig({
					schedule_enabled: Boolean(data.schedule_enabled),
					schedule_interval_minutes: String(data.schedule_interval_minutes),
					max_content_chars: String(data.max_content_chars),
					max_per_run: String(data.max_per_run ?? 5),
					include_comments: Boolean(data.include_comments),
					comment_max_items: String(data.comment_max_items),
					cron_secret: String(data.cron_secret ?? ""),
					updated_at: data.updated_at,
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load config.");
			} finally {
				setLoading(false);
			}
		};
		loadConfig();
	}, []);

	const handleSave = async () => {
		setError(null);
		setStatus(null);

		const scheduleInterval = parseNumber(config.schedule_interval_minutes);
		const maxChars = parseNumber(config.max_content_chars);
		const maxPerRun = parseNumber(config.max_per_run);
		const commentMax = parseNumber(config.comment_max_items);

		if (
			scheduleInterval === null ||
			maxChars === null ||
			maxPerRun === null ||
			commentMax === null
		) {
			setError("Please enter valid numeric values.");
			return;
		}

		if (config.cron_secret.trim().length < 16) {
			setError("Cron secret must be at least 16 characters.");
			return;
		}

		setSaving(true);
		try {
			const res = await fetch("/api/config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					schedule_enabled: config.schedule_enabled,
					schedule_interval_minutes: scheduleInterval,
					max_content_chars: maxChars,
					max_per_run: maxPerRun,
					include_comments: config.include_comments,
					comment_max_items: commentMax,
					cron_secret: config.cron_secret.trim(),
				}),
			});
			const data = (await res.json()) as ConfigState | ApiError;
			if (!res.ok || "error" in data) {
				setError(data.error ?? `Save failed (${res.status}).`);
				return;
			}
			setConfig({
				schedule_enabled: Boolean(data.schedule_enabled),
				schedule_interval_minutes: String(data.schedule_interval_minutes),
				max_content_chars: String(data.max_content_chars),
				max_per_run: String(data.max_per_run ?? 5),
				include_comments: Boolean(data.include_comments),
				comment_max_items: String(data.comment_max_items),
				cron_secret: String(data.cron_secret ?? ""),
				updated_at: data.updated_at,
			});
			setStatus("Saved");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Save failed.");
		} finally {
			setSaving(false);
		}
	};

	const handleGenerateSecret = () => {
		setConfig((prev) => ({
			...prev,
			cron_secret: generateSecret(),
		}));
		setStatus("New secret generated (remember to save).");
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(config.cron_secret);
			setStatus("Cron secret copied.");
		} catch {
			setError("Failed to copy secret.");
		}
	};

	const handleForceUnlock = async () => {
		setError(null);
		setStatus(null);
		const secret = config.cron_secret.trim();
		if (secret.length < 16) {
			setError("Cron secret is required to unlock.");
			return;
		}
		if (!window.confirm("Force unlock the job lock?")) {
			return;
		}
		setUnlocking(true);
		try {
			const res = await fetch("/api/jobs/unlock", {
				method: "POST",
				headers: { "x-cron-secret": secret },
			});
			const data = (await res.json()) as ApiError;
			if (!res.ok || data?.error) {
				setError(data?.error ?? `Unlock failed (${res.status}).`);
				return;
			}
			setStatus("Lock cleared.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unlock failed.");
		} finally {
			setUnlocking(false);
		}
	};

	if (loading) {
		return (
			<div className={styles.card}>
				<span style={{ marginRight: 8 }}>Loading config</span>
				<Spinner />
			</div>
		);
	}

	return (
		<div className={styles.section}>
			{error ? <InlineAlert type="error" message={error} /> : null}
			{status ? <InlineAlert type="success" message={status} /> : null}

			<form
				onSubmit={(event) => {
					event.preventDefault();
					handleSave();
				}}
			>
				<section className={styles.card}>
					<div className={styles.cardHeader}>
						<h2 className={styles.cardTitle}>Scheduler</h2>
					</div>
					<div className={styles.grid}>
						<label className={styles.field}>
							<div className={styles.label}>Schedule Enabled</div>
							<div className={styles.toggleRow}>
								<input
									type="checkbox"
									checked={config.schedule_enabled}
									onChange={(event) =>
										setConfig((prev) => ({
											...prev,
											schedule_enabled: event.target.checked,
										}))
									}
								/>
								<span className={styles.value}>
									{config.schedule_enabled ? "Enabled" : "Disabled"}
								</span>
							</div>
						</label>
						<label className={styles.field}>
							<div className={styles.label}>Interval (minutes)</div>
							<input
								className={styles.input}
								type="number"
								min={5}
								max={10080}
								value={config.schedule_interval_minutes}
								onChange={(event) =>
									setConfig((prev) => ({
										...prev,
										schedule_interval_minutes: event.target.value,
									}))
								}
							/>
						</label>
						<label className={styles.field}>
							<div className={styles.label}>Max per run</div>
							<input
								className={styles.input}
								type="number"
								min={1}
								max={50}
								value={config.max_per_run}
								onChange={(event) =>
									setConfig((prev) => ({
										...prev,
										max_per_run: event.target.value,
									}))
								}
							/>
						</label>
					</div>
				</section>

				<section className={`${styles.card} ${styles.section}`}>
					<div className={styles.cardHeader}>
						<h2 className={styles.cardTitle}>Extraction</h2>
					</div>
					<div className={styles.grid}>
						<label className={styles.field}>
							<div className={styles.label}>Max content chars</div>
							<input
								className={styles.input}
								type="number"
								min={1000}
								max={50000}
								value={config.max_content_chars}
								onChange={(event) =>
									setConfig((prev) => ({
										...prev,
										max_content_chars: event.target.value,
									}))
								}
							/>
						</label>
						<label className={styles.field}>
							<div className={styles.label}>Include comments</div>
							<div className={styles.toggleRow}>
								<input
									type="checkbox"
									checked={config.include_comments}
									onChange={(event) =>
										setConfig((prev) => ({
											...prev,
											include_comments: event.target.checked,
										}))
									}
								/>
								<span className={styles.value}>
									{config.include_comments ? "Enabled" : "Disabled"}
								</span>
							</div>
							<div className={styles.hint}>v0 unused</div>
						</label>
						<label className={styles.field}>
							<div className={styles.label}>Comment max items</div>
							<input
								className={styles.input}
								type="number"
								min={0}
								max={200}
								value={config.comment_max_items}
								onChange={(event) =>
									setConfig((prev) => ({
										...prev,
										comment_max_items: event.target.value,
									}))
								}
							/>
						</label>
					</div>
				</section>

				<section className={`${styles.card} ${styles.section}`}>
					<div className={styles.cardHeader}>
						<h2 className={styles.cardTitle}>Cron Secret</h2>
					</div>
					<div className={styles.section}>
						<label className={styles.field}>
							<div className={styles.label}>Secret</div>
							<div className={styles.formRow}>
								<input
									className={styles.input}
									type={revealSecret ? "text" : "password"}
									value={config.cron_secret}
									onChange={(event) =>
										setConfig((prev) => ({
											...prev,
											cron_secret: event.target.value,
										}))
									}
								/>
								<button
									type="button"
									className={styles.buttonSecondary}
									onClick={() => setRevealSecret((prev) => !prev)}
								>
									{revealSecret ? "Hide" : "Reveal"}
								</button>
							</div>
						</label>
					</div>
					<div className={styles.formRow}>
						<button
							type="button"
							className={styles.buttonSecondary}
							onClick={handleGenerateSecret}
						>
							Generate new secret
						</button>
						<button
							type="button"
							className={styles.buttonSecondary}
							onClick={handleCopy}
						>
							Copy
						</button>
						<button
							type="button"
							className={styles.buttonSecondary}
							onClick={handleForceUnlock}
							disabled={unlocking}
						>
							{unlocking ? "Unlocking..." : "Force Unlock"}
						</button>
					</div>
				</section>

				<div className={styles.section}>
					<button className={styles.button} type="submit" disabled={saving}>
						{saving ? "Saving..." : "Save"}
					</button>
					{config.updated_at ? (
						<p className={styles.hint}>
							Last updated: {new Date(config.updated_at).toLocaleString()}
						</p>
					) : null}
				</div>
			</form>
		</div>
	);
}
