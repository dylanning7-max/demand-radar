"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../../components/ui.module.css";
import { InlineAlert } from "../../../components/InlineAlert";

type ApiError = { error?: string; ok?: boolean };

export default function AdminLoginPage() {
	const router = useRouter();
	const [key, setKey] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("/api/admin/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ key }),
			});
			const data = (await res.json()) as ApiError;
			if (!res.ok || data?.ok === false) {
				setError(data?.error ?? "Invalid key.");
				return;
			}
			router.replace("/admin");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerRow}>
					<div>
						<h1 className={styles.title}>Admin Login</h1>
						<p className={styles.subtext}>Enter your admin key to continue.</p>
					</div>
					<div className={styles.headerActions}>
						<Link className={styles.buttonSecondary} href="/">
							Home
						</Link>
					</div>
				</div>
			</header>

			{error ? <InlineAlert type="error" message={error} /> : null}

			<section className={styles.card}>
				<form onSubmit={handleSubmit}>
					<label className={styles.field}>
						<div className={styles.label}>Admin Key</div>
						<input
							className={styles.input}
							type="password"
							value={key}
							onChange={(event) => setKey(event.target.value)}
							placeholder="Enter ADMIN_KEY"
						/>
					</label>
					<div className={styles.section}>
						<button className={styles.button} type="submit" disabled={loading}>
							{loading ? "Signing in..." : "Sign in"}
						</button>
					</div>
				</form>
			</section>
		</main>
	);
}
