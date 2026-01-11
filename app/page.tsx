import Link from "next/link";
import styles from "../components/ui.module.css";
import { HomeClient } from "../components/HomeClient";
import { TopSignalsPanel } from "../components/TopSignalsPanel";

export default function HomePage() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerRow}>
					<div>
						<h1 className={styles.title}>Demand Radar</h1>
						<p className={styles.subtext}>
							Paste a URL to extract demand signals.
						</p>
					</div>
					<div className={styles.headerActions}>
						<Link className={styles.buttonSecondary} href="/config">
							Config
						</Link>
						<Link className={styles.buttonSecondary} href="/saved">
							Saved
						</Link>
					</div>
				</div>
			</header>
			<TopSignalsPanel />
			<HomeClient />
		</main>
	);
}
