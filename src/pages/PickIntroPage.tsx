import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPoll } from "../lib/api.ts";
import { SITE } from "../lib/consts.ts";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";

/**
 * A button rather than a create-on-mount effect: StrictMode runs effects twice
 * in development, which would mint two polls and strand one of them. It also
 * gives the feature somewhere to say what it is.
 */
export function PickIntroPage() {
	useDocumentTitle(`Pick a time — ${SITE.name}`);
	const navigate = useNavigate();
	const [title, setTitle] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function create(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const pollId = await createPoll(title.trim());
			navigate(`/pick/${pollId}`, { replace: true });
		} catch {
			setError("Could not create the poll. Try again in a moment.");
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-lg flex-col px-4">
			<h1 className="my-5 font-bold text-2xl md:text-3xl">Pick a time</h1>

			<p className="mb-2 text-muted-foreground">
				Mark the hours you are busy and the ones you would prefer, then send the
				link to everyone else. Each person marks in their own time zone, and the
				windows that work for the group appear underneath.
			</p>
			<p className="mb-6 text-muted-foreground text-sm">
				Anyone with the link can see and add availability. There are no accounts
				— your slots are remembered by this browser.
			</p>

			<form onSubmit={create} className="flex flex-col gap-3">
				<label className="flex flex-col gap-1" htmlFor="poll-title">
					<span className="text-muted-foreground text-sm">
						What is it for? (optional)
					</span>
					<Input
						id="poll-title"
						value={title}
						maxLength={100}
						placeholder="Q3 sync"
						onChange={(event) => setTitle(event.target.value)}
					/>
				</label>

				{error && <p className="text-destructive text-sm">{error}</p>}

				<Button type="submit" disabled={busy}>
					{busy ? "Creating…" : "Create a poll"}
				</Button>
			</form>
		</div>
	);
}
