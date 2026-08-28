import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SITE } from "../lib/consts";
import { CheckIcon, ShareIcon } from "./icons";

type ShareButtonProps = {
	/** Already carries the watched zones as `?watch=` params. */
	url: string;
	disabled?: boolean;
};

/**
 * Hands the link to the OS share sheet where there is one, and copies it to the
 * clipboard everywhere else. Nothing is uploaded: the lineup is the URL.
 */
export function ShareButton({ url, disabled }: ShareButtonProps) {
	const [copied, setCopied] = useState(false);
	const resetRef = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(resetRef.current), []);

	function copy() {
		navigator.clipboard
			?.writeText(url)
			.then(() => {
				setCopied(true);
				window.clearTimeout(resetRef.current);
				resetRef.current = window.setTimeout(() => setCopied(false), 2000);
			})
			// Denied clipboard permission, or an insecure origin. Nothing to retry.
			.catch(() => {});
	}

	async function share() {
		if (navigator.share) {
			try {
				await navigator.share({ title: SITE.name, url });
				return;
			} catch (error) {
				// A dismissed sheet is a decision, not a failure — don't then copy.
				if ((error as DOMException | undefined)?.name === "AbortError") {
					return;
				}
			}
		}
		copy();
	}

	return (
		<Button
			variant="outline"
			onClick={share}
			disabled={disabled}
			aria-label="Share these time zones"
		>
			{copied ? <CheckIcon /> : <ShareIcon />}
			<span className="hidden md:inline">{copied ? "Copied" : "Share"}</span>
			<span aria-live="polite" className="sr-only">
				{copied ? "Link copied" : ""}
			</span>
		</Button>
	);
}
