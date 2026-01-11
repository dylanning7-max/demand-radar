import styles from "../../../components/ui.module.css";

export default function HistoryDetailLoading() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Analysis Detail</h1>
				<p className={styles.subtext}>Loading analysis...</p>
			</header>
			<section className={styles.section}>
				<div className={styles.card}>
					<div className={styles.skeletonTitle} />
					<div className={styles.skeletonLine} />
					<div className={styles.skeletonLine} />
					<div className={styles.skeletonBlock} />
					<div className={styles.skeletonLineShort} />
				</div>
			</section>
		</main>
	);
}
