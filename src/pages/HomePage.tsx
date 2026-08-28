import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreateEventPopover } from "../components/CreateEventPopover";
import { DateNavigator } from "../components/DateNavigator";
import { DesktopClockGrid } from "../components/DesktopClockGrid";
import { MobileClockGrid } from "../components/MobileClockGrid";
import { SelectButton } from "../components/SelectButton";
import { ShareButton } from "../components/ShareButton";
import { ZonePicker } from "../components/ZonePicker";
import { SITE } from "../lib/consts";
import { dayjs } from "../lib/dayjs";
import { getSlots, type PickedSlot } from "../lib/grid";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { DESKTOP_QUERY, useMediaQuery } from "../lib/useMediaQuery";

const TIME_FORMAT_OPTIONS = [
	{ value: "12", label: "am/pm" },
	{ value: "24", label: "24" },
] as const;

type TimeFormat = (typeof TIME_FORMAT_OPTIONS)[number]["value"];

/** Every IANA zone the browser knows. ZonePicker owns the matching. */
const availableTimezones = Intl.supportedValuesOf("timeZone");

export function HomePage() {
	useDocumentTitle(SITE.title);

	const isDesktop = useMediaQuery(DESKTOP_QUERY);
	const [searchParams, setSearchParams] = useSearchParams();
	const [myTimezone] = useState(() => dayjs.tz.guess());
	const [now] = useState(() => dayjs.utc());
	// The moment the grid is centred on: `now` until the user navigates away.
	const [anchor, setAnchor] = useState(now);
	const slots = useMemo(() => getSlots(anchor), [anchor]);

	const [formatTime, setFormatTime] = useState<TimeFormat>("24");
	// The cell whose "create event" surface is open, if any.
	const [pickedSlot, setPickedSlot] = useState<PickedSlot | null>(null);
	const closePickedSlot = useCallback(() => setPickedSlot(null), []);

	// Seeded from `?watch=` once on mount, then owned here and mirrored back to
	// the URL on every mutation.
	const [watchedTimezones, setWatchedTimezones] = useState(() => {
		const watched = searchParams.getAll("watch");
		return watched.length > 0 ? watched : [myTimezone];
	});

	// Built from state rather than read off `location`, so a first visit — which
	// has no `?watch=` yet — still shares the guessed zone instead of nothing.
	const shareUrl = useMemo(() => {
		const url = new URL(window.location.href);
		url.searchParams.delete("watch");
		for (const timezone of watchedTimezones) {
			url.searchParams.append("watch", timezone);
		}
		return url.toString();
	}, [watchedTimezones]);

	function updateWatchedTimezones(timezones: string[]) {
		// Row indices shift underneath the popover, so drop it.
		setPickedSlot(null);
		setWatchedTimezones(timezones);
		setSearchParams(
			timezones.map((timezone): [string, string] => ["watch", timezone]),
		);
	}

	function addTimezoneToWatchedList(value: string) {
		if (watchedTimezones.includes(value) || value.length === 0) {
			return;
		}
		updateWatchedTimezones([...watchedTimezones, value]);
	}

	function deleteTimezone(timezone: string) {
		updateWatchedTimezones(watchedTimezones.filter((tz) => tz !== timezone));
	}

	/** Earlier in the list: up on desktop, left on mobile. */
	function moveTimezoneEarlier(timezone: string) {
		const index = watchedTimezones.indexOf(timezone);
		if (index <= 0) {
			return;
		}
		const reordered = [...watchedTimezones];
		reordered[index] = reordered[index - 1] as string;
		reordered[index - 1] = timezone;
		updateWatchedTimezones(reordered);
	}

	function moveTimezoneLater(timezone: string) {
		const index = watchedTimezones.indexOf(timezone);
		if (index < 0 || index >= watchedTimezones.length - 1) {
			return;
		}
		const reordered = [...watchedTimezones];
		reordered[index] = reordered[index + 1] as string;
		reordered[index + 1] = timezone;
		updateWatchedTimezones(reordered);
	}

	const gridProps = {
		slots,
		timezones: watchedTimezones,
		myTimezone,
		anchor,
		now,
		hour12: formatTime === "12",
		picked: pickedSlot,
		onPick: setPickedSlot,
		onClosePicked: closePickedSlot,
		onRemove: deleteTimezone,
		onMoveEarlier: moveTimezoneEarlier,
		onMoveLater: moveTimezoneLater,
	};

	// The mobile grid has no room to anchor a popover, so the sheet lives here.
	const pickedTimezone = pickedSlot && watchedTimezones[pickedSlot.rowIndex];
	const pickedStart = pickedSlot && slots[pickedSlot.slotIndex];

	return (
		<>
			<div className="flex justify-center px-3 md:min-w-[1200px] md:px-0">
				{/* Shrink-to-fit on desktop, so the grid keeps its original width. */}
				<div className="w-full max-w-[980px] md:w-auto">
					<div className="flex">
						<h1 className="my-4 font-bold text-2xl md:my-5 md:text-3xl">
							Timeinator
						</h1>
					</div>

					<div className="mb-4 flex items-end gap-2 md:mb-6 md:items-stretch md:justify-between md:gap-0">
						<div className="min-w-0 flex-1 md:flex-none">
							<ZonePicker
								timezones={availableTimezones}
								selected={watchedTimezones}
								onSelect={addTimezoneToWatchedList}
							/>
						</div>
						{/* items-start: never let the row's height stretch the toggle. */}
						<div className="flex shrink-0 items-start justify-end gap-2">
							<ShareButton
								url={shareUrl}
								disabled={watchedTimezones.length === 0}
							/>
							<SelectButton
								id="selectFormat"
								value={formatTime}
								options={[...TIME_FORMAT_OPTIONS]}
								onChange={setFormatTime}
							/>
						</div>
					</div>

					<div className="mb-4 flex justify-center">
						<DateNavigator
							value={anchor}
							now={now}
							onChange={(value) => {
								setPickedSlot(null);
								setAnchor(value);
							}}
						/>
					</div>

					{watchedTimezones.length > 0 ? (
						isDesktop ? (
							<DesktopClockGrid {...gridProps} />
						) : (
							<MobileClockGrid {...gridProps} />
						)
					) : (
						<div className="py-8 text-center text-text-secondary">
							Please select couple of timezones to compare
						</div>
					)}
				</div>
			</div>

			{!isDesktop && pickedTimezone && pickedStart && (
				<CreateEventPopover
					start={pickedStart}
					timezone={pickedTimezone}
					timezones={watchedTimezones}
					hour12={formatTime === "12"}
					variant="sheet"
					onClose={closePickedSlot}
				/>
			)}

			<div className="mt-8 flex flex-col items-center gap-1 bg-footer md:absolute md:right-0 md:bottom-0 md:left-0 md:mt-0 md:min-w-[1200px] md:flex-row md:items-stretch md:justify-between md:gap-0">
				<p className="mt-3 text-muted-foreground text-xs md:my-3 md:pl-6">
					Developed by{" "}
					<a
						className="underline hover:text-primary"
						href="https://frrcode.com"
						target="_blank"
						rel="noreferrer"
					>
						frrcode
					</a>
				</p>
				<p className="text-muted-foreground text-xs md:my-3">
					<a
						className="underline hover:text-primary"
						href="https://github.com/FrrCode/Timeinator"
						target="_blank"
						rel="noreferrer"
					>
						Source on GitHub
					</a>
				</p>
				<p className="mb-3 text-muted-foreground text-xs md:my-3 md:pr-6">
					<a
						className="underline hover:text-primary"
						href="https://apps.frrcode.com/en/timeinator/"
						target="_blank"
						rel="noreferrer"
					>
						About
					</a>
				</p>
			</div>
		</>
	);
}
