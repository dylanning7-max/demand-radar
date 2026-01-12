import Link from "next/link";
import { Suspense } from "react";
import styles from "../components/ui.module.css";
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
						<Link className={styles.buttonSecondary} href="/saved">
							Saved
						</Link>
						<Link className={styles.buttonSecondary} href="/admin">
							Admin
						</Link>
					</div>
				</div>
			</header>
			<Suspense
				fallback={
					<section className={styles.section}>
						<div className={styles.panelHeader}>
							<div>
								<h2 className={styles.cardTitle}>Top Signals</h2>
								<p className={styles.subtext}>DEMAND-only highlights.</p>
							</div>
						</div>
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
					</section>
				}
			>
				<TopSignalsPanel />
			</Suspense>
		</main>
	);
}
