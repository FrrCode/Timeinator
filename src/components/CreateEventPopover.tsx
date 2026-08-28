import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "../lib/cn";
import type { Dayjs } from "../lib/dayjs";
import { buildGoogleCalendarUrl } from "../lib/googleCalendar";
import { TimesIcon } from "./icons";
import { SelectButton } from "./SelectButton";

const DURATION_OPTIONS = [
	{ value: 30, label: "30m" },
	{ value: 60, label: "1h" },
	{ value: 120, label: "2h" },
] as const;

type CreateEventPopoverProps = {
	/** Start of the clicked hour, in UTC. */
	start: Dayjs;
	/** Time zone of the row that was clicked. */
	timezone: string;
	/** Every watched zone, listed in the event description. */
	timezones: string[];
	hour12: boolean;
	/** Which edge to hang off, so cells near the ends stay on screen. */
	align?: "start" | "center" | "end";
	/**
	 * `popover` anchors to the clicked cell; `sheet` pins to the bottom of the
	 * screen, which is the only place a 288px card reliably fits on a phone.
	 */
	variant?: "popover" | "sheet";
	onClose: () => void;
};

export function CreateEventPopover({
	start,
	timezone,
	timezones,
	hour12,
	align = "center",
	variant = "popover",
	onClose,
}: CreateEventPopoverProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [title, setTitle] = useState("Meeting");
	const [duration, setDuration] = useState<number>(60);

	useEffect(() => {
		function onPointerDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) {
				onClose();
			}
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [onClose]);

	const timeFormat = hour12 ? "h:mm a" : "HH:mm";
	const end = start.add(duration, "minute");
	const localStart = start.tz(timezone);

	const details = [
		"Planned with Timeinator.",
		"",
		...timezones.map(
			(zone) =>
				`${zone}: ${start.tz(zone).format(`ddd, MMM D, ${timeFormat}`)} – ${end
					.tz(zone)
					.format(timeFormat)}`,
		),
	].join("\n");

	const url = buildGoogleCalendarUrl({
		title: title.trim() || "Meeting",
		start,
		end,
		details,
	});

	const isSheet = variant === "sheet";

	return (
		<>
			{isSheet && (
				// Tapping it falls through to the outside-click handler below.
				<div className="fixed inset-0 z-30 bg-black/30" aria-hidden="true" />
			)}
			<div
				ref={rootRef}
				className={cn(
					"border border-border bg-popover text-left text-popover-foreground shadow-lg",
					isSheet
						? "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-x-0 border-b-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
						: cn(
								"absolute top-full z-20 mt-1 w-72 rounded-lg p-3",
								align === "center" && "-translate-x-1/2 left-1/2",
								align === "start" && "left-0",
								align === "end" && "right-0",
							),
				)}
			>
				<div className="mb-2 flex items-start justify-between gap-2">
					<div>
						<div className="font-semibold text-sm">
							{localStart.format(`ddd, MMM D · ${timeFormat}`)} –{" "}
							{end.tz(timezone).format(timeFormat)}
						</div>
						<div className="text-muted-foreground text-xs">{timezone}</div>
					</div>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="cursor-pointer text-muted-foreground text-xs hover:text-primary"
					>
						<TimesIcon />
					</button>
				</div>

				<Input
					type="text"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Event title"
					className="mb-2"
				/>

				<div className="mb-3">
					{/* Durations are minutes; the segmented control is keyed on
					    strings, so they cross the boundary as strings and come back
					    numbers. */}
					<SelectButton
						value={String(duration)}
						options={DURATION_OPTIONS.map((option) => ({
							value: String(option.value),
							label: option.label,
						}))}
						onChange={(value) => setDuration(Number(value))}
						ariaLabelledBy="event-duration-label"
					/>
					<span id="event-duration-label" className="sr-only">
						Duration
					</span>
				</div>

				<Button
					className="w-full"
					render={
						<a href={url} target="_blank" rel="noreferrer" onClick={onClose} />
					}
				>
					Create Google Calendar event
				</Button>
				<p className="mt-2 text-muted-foreground text-xs">
					Opens Google Calendar with the details filled in — nothing is saved
					until you confirm there.
				</p>
			</div>
		</>
	);
}
