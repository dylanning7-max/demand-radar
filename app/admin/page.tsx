import Link from "next/link";
import styles from "../../components/ui.module.css";
import { SystemHealth } from "../../components/admin/SystemHealth";
import { AnalysisTools } from "../../components/admin/AnalysisTools";
import { JobDebugger } from "../../components/admin/JobDebugger";

export default function AdminPage() {
	return (
		<main className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerRow}>
					<div>
						<h1 className={styles.title}>Admin</h1>
						<p className={styles.subtext}>Operational tools and diagnostics.</p>
					</div>
					<div className={styles.headerActions}>
						<Link className={styles.buttonSecondary} href="/">
							Home
						</Link>
						<Link className={styles.buttonSecondary} href="/config">
							Config
						</Link>
					</div>
				</div>
			</header>

			<SystemHealth />
			<AnalysisTools />
			<JobDebugger />
		</main>
	);
}
