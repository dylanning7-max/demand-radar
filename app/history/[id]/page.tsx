import styles from "../../../components/ui.module.css";
import { HistoryDetailClient } from "../../../components/HistoryDetailClient";

export default async function HistoryDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Analysis Detail</h1>
				<p className={styles.subtext}>Deep link to a single analysis.</p>
			</header>
			<HistoryDetailClient id={id} />
		</main>
	);
}
