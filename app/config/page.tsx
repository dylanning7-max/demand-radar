import styles from "../../components/ui.module.css";
import { ConfigClient } from "../../components/ConfigClient";

export default function ConfigPage() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>Configuration</h1>
				<p className={styles.subtext}>
					Manage scheduler and extraction settings.
				</p>
			</header>
			<ConfigClient />
		</main>
	);
}

