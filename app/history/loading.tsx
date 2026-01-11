import styles from "../../components/ui.module.css";

export default function HistoryLoading() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerRow}>
					<div>
						<h1 className={styles.title}>History</h1>
						<p className={styles.subtext}>Loading history...</p>
					</div>
				</div>
			</header>
			<section className={styles.section}>
				<div className={styles.list}>
					{Array.from({ length: 8 }).map((_, index) => (
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
		</main>
	);
}
