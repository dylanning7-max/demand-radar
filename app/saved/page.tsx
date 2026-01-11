import Link from "next/link";
import styles from "../../components/ui.module.css";
import { SavedClient } from "../../components/SavedClient";

export default function SavedPage() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerRow}>
					<div>
						<h1 className={styles.title}>Saved</h1>
						<p className={styles.subtext}>Review your saved signals.</p>
					</div>
					<div className={styles.headerActions}>
						<Link href="/" className={styles.buttonSecondary}>
							Back to Home
						</Link>
					</div>
				</div>
			</header>
			<SavedClient />
		</main>
	);
}
