import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { participantColor } from "../../shared/identity.ts";

type IdentityBarProps = {
	name: string;
	avatar: string;
	/** Roster position once joined; -1 before, which still yields a colour. */
	index: number;
	onNameChange: (name: string) => void;
};

/**
 * Your own name, always visible and always editable.
 *
 * You arrive already called something, so nothing has to interrupt you before
 * your first drag. Before you have joined this edits local state; afterwards
 * the page debounces a PATCH.
 */
export function IdentityBar({
	name,
	avatar,
	index,
	onNameChange,
}: IdentityBarProps) {
	const [draft, setDraft] = useState(name);
	// Someone else's rename cannot happen, but a rejected PATCH can revert it.
	useEffect(() => setDraft(name), [name]);

	const color = participantColor(Math.max(index, 0));

	function commit() {
		const trimmed = draft.trim();
		if (trimmed.length === 0) {
			setDraft(name);
			return;
		}
		if (trimmed !== name) {
			onNameChange(trimmed);
		}
	}

	return (
		<div className="flex items-center gap-2">
			<span
				aria-hidden="true"
				className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg"
				style={{
					backgroundColor: `${color}22`,
					boxShadow: `0 0 0 1px ${color}`,
				}}
			>
				{avatar || "🙂"}
			</span>
			<Input
				value={draft}
				maxLength={40}
				aria-label="Your name"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setDraft(name);
						event.currentTarget.blur();
					}
				}}
				className="h-8 w-44 border-transparent bg-transparent px-2 font-semibold shadow-none transition-colors hover:border-border focus-visible:border-border"
				style={{ color }}
			/>
		</div>
	);
}
