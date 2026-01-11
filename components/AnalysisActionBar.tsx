"use client";

import { useEffect, useState } from "react";
import styles from "./ui.module.css";

type ActionType = "saved" | "ignored" | "watching" | null;

type ActionState = {
	action: ActionType;
	tags: string[];
	note: string | null;
	action_updated_at?: string | null;
};

type AnalysisActionBarProps = {
	analysisId: string;
	action: ActionType;
	tags?: string[];
	note?: string | null;
	onChange?: (next: ActionState) => void;
};

type ApiResponse = {
	analysis_id: string;
	action: ActionType;
	tags?: string[];
	note?: string | null;
	updated_at?: string;
	error?: string;
};

function isAction(value: string | null | undefined): ActionType {
	if (value === "saved" || value === "ignored" || value === "watching") {
		return value;
	}
	return null;
}

function normalizeTags(tags: string[]): string {
	return tags.join(", ");
}

function parseTags(input: string): string[] {
	const parts = input
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean);
	return parts;
}

export function AnalysisActionBar({
	analysisId,
	action,
	tags,
	note,
	onChange,
}: AnalysisActionBarProps) {
	const [current, setCurrent] = useState<ActionState>({
		action: isAction(action),
		tags: Array.isArray(tags) ? tags : [],
		note: note ?? null,
	});
	const [editing, setEditing] = useState(false);
	const [tagInput, setTagInput] = useState(normalizeTags(current.tags));
	const [noteInput, setNoteInput] = useState(current.note ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const next: ActionState = {
			action: isAction(action),
			tags: Array.isArray(tags) ? tags : [],
			note: note ?? null,
		};
		setCurrent(next);
		setTagInput(normalizeTags(next.tags));
		setNoteInput(next.note ?? "");
	}, [action, tags, note]);

	const syncState = (next: ActionState) => {
		setCurrent(next);
		setTagInput(normalizeTags(next.tags));
		setNoteInput(next.note ?? "");
		onChange?.(next);
	};

	const postAction = async (nextAction: ActionType, nextTags: string[], nextNote: string | null) => {
		setSaving(true);
		setError(null);
		const prev = current;
		const optimistic: ActionState = {
			action: nextAction,
			tags: nextAction ? nextTags : [],
			note: nextAction ? nextNote : null,
		};
		syncState(optimistic);

		try {
			const res = await fetch("/api/analysis-actions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					analysis_id: analysisId,
					action: nextAction,
					tags: nextTags,
					note: nextNote,
				}),
			});
			const data = (await res.json()) as ApiResponse;
			if (!res.ok || data.error) {
				throw new Error(data.error ?? "Failed to update action.");
			}
			const applied: ActionState = {
				action: isAction(data.action),
				tags: Array.isArray(data.tags) ? data.tags : nextTags,
				note: data.note ?? nextNote ?? null,
				action_updated_at: data.updated_at ?? current.action_updated_at,
			};
			syncState(applied);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update action.");
			syncState(prev);
		} finally {
			setSaving(false);
		}
	};

	const toggleAction = (next: Exclude<ActionType, null>) => {
		const updated = current.action === next ? null : next;
		postAction(updated, current.tags, current.note);
	};

	const applyTagsNote = () => {
		const parsedTags = parseTags(tagInput);
		const cleanedNote = noteInput.trim() ? noteInput.trim() : null;
		const nextAction = current.action ?? "saved";
		postAction(nextAction, parsedTags, cleanedNote);
		setEditing(false);
	};

	return (
		<div className={styles.actionBar}>
			<div className={styles.actionRow}>
				{current.action === "saved" ? (
					<span className={`${styles.badge} ${styles.badgeStrong}`}>Saved</span>
				) : null}
				{current.action === "watching" ? (
					<span className={`${styles.badge} ${styles.badgeInfo}`}>Watching</span>
				) : null}
				{current.action === "ignored" ? (
					<span className={`${styles.badge} ${styles.badgeNone}`}>Ignored</span>
				) : null}
				<button
					type="button"
					className={`${styles.actionButton} ${
						current.action === "saved" ? styles.actionButtonActive : ""
					}`}
					onClick={() => toggleAction("saved")}
					disabled={saving}
				>
					Save
				</button>
				<button
					type="button"
					className={`${styles.actionButton} ${
						current.action === "watching" ? styles.actionButtonActive : ""
					}`}
					onClick={() => toggleAction("watching")}
					disabled={saving}
				>
					Watching
				</button>
				<button
					type="button"
					className={`${styles.actionButton} ${
						current.action === "ignored" ? styles.actionButtonActive : ""
					}`}
					onClick={() => toggleAction("ignored")}
					disabled={saving}
				>
					Ignore
				</button>
				<button
					type="button"
					className={styles.actionButton}
					onClick={() => setEditing((prev) => !prev)}
					disabled={saving}
				>
					Edit
				</button>
			</div>
			{editing ? (
				<div className={styles.actionEditor}>
					<label className={styles.label}>Tags (comma separated)</label>
					<input
						className={styles.input}
						value={tagInput}
						onChange={(event) => setTagInput(event.target.value)}
						placeholder="growth, b2b, devtools"
					/>
					<label className={styles.label}>Note</label>
					<textarea
						className={styles.textarea}
						rows={3}
						value={noteInput}
						onChange={(event) => setNoteInput(event.target.value)}
						placeholder="Why it matters, next steps, etc."
					/>
					<p className={styles.hint}>
						Apply will save this item if it is still in Inbox.
					</p>
					<div className={styles.actionRow}>
						<button
							type="button"
							className={styles.button}
							onClick={applyTagsNote}
							disabled={saving}
						>
							Apply
						</button>
						<button
							type="button"
							className={styles.buttonSecondary}
							onClick={() => setEditing(false)}
							disabled={saving}
						>
							Cancel
						</button>
					</div>
				</div>
			) : null}
			{error ? <p className={styles.errorText}>{error}</p> : null}
		</div>
	);
}
