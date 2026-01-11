"use client";

import styles from "./ui.module.css";

type InlineAlertProps = {
	type: "error" | "info" | "success";
	message: string;
};

export function InlineAlert({ type, message }: InlineAlertProps) {
	const className = `${styles.alert} ${styles[`alert_${type}`]}`;
	return <div className={className}>{message}</div>;
}

