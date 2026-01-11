import Link from "next/link";
import styles from "../../components/ui.module.css";
import { HistoryClient } from "../../components/HistoryClient";

export default function HistoryPage() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerRow}>
					<div>
						<h1 className={styles.title}>History</h1>
						<p className={styles.subtext}>
							Review analyses and job runs.
						</p>
					</div>
					<div className={styles.headerActions}>
						<Link href="/" className={styles.buttonSecondary}>
							Back to Home
						</Link>
					</div>
				</div>
			</header>
			<HistoryClient />
		</main>
	);
}
