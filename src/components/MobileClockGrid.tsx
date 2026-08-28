import { useEffect, useRef } from "react";
import { cn } from "../lib/cn";
import {
	type ClockGridProps,
	hourTone,
	TONE_CLASS,
	zoneCityLabel,
	zoneRegion,
} from "../lib/grid";
import { ChevronLeftIcon, ChevronRightIcon, TimesIcon } from "./icons";

const controlClass =
	"flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[10px] transition-colors hover:bg-hover-surface active:bg-hover-surface";

/**
 * Narrowest a zone column may get. The track is widened to this times the zone
 * count, so columns share the screen evenly until there are too many to fit and
 * the grid starts scrolling sideways instead.
 */
const COLUMN_MIN_PX = 72;

/**
 * The desktop grid transposed: one column per time zone, one row per hour.
 *
 * A phone has vertical room and no hover, so hours run down the screen and every
 * cell carries its tint permanently rather than revealing it on hover.
 */
export function MobileClockGrid({
	slots,
	timezones,
	myTimezone,
	anchor,
	now,
	hour12,
	picked,
	onPick,
	onRemove,
	onMoveEarlier,
	onMoveLater,
}: ClockGridProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const nowRowRef = useRef<HTMLDivElement>(null);

	// Open on the current hour rather than 12 hours ago.
	useEffect(() => {
		const scroller = scrollRef.current;
		const row = nowRowRef.current;
		if (!scroller || !row) {
			return;
		}
		scroller.scrollTop = Math.max(
			0,
			row.offsetTop - scroller.clientHeight / 2.5,
		);
	}, []);

	return (
		<div
			ref={scrollRef}
			// `relative` makes the rows' offsetTop resolve against this scroll port.
			className="relative max-h-[60dvh] overflow-auto rounded-lg border border-border"
		>
			<div
				className="w-full"
				style={{ minWidth: `${timezones.length * COLUMN_MIN_PX}px` }}
			>
				<div className=// Opaque, not tinted: the hour rows scroll underneath this and a
				// translucent background shows every one of them through it.
				"sticky top-0 z-10 flex border-border border-b bg-background">
					{timezones.map((timezone, columnIndex) => (
						<div
							key={timezone}
							className={cn(
								"flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-1 py-2",
								columnIndex > 0 && "border-border border-l",
								columnIndex === 0 ? "font-semibold" : "text-text-secondary",
							)}
						>
							{/* Two lines' worth, so wrapped names don't misalign the row. */}
							<div className="flex min-h-[2.2rem] items-center text-center font-semibold text-sm leading-tight">
								{zoneCityLabel(timezone)}
							</div>
							<div className="font-medium text-[10px] leading-tight">
								{zoneRegion(timezone)}
							</div>
							<div className="font-semibold text-sm">
								{anchor.tz(timezone).format(hour12 ? "h:mm a" : "H:mm")}
							</div>
							<div className="whitespace-nowrap font-medium text-[10px]">
								{anchor.tz(timezone).format("MMM D")}
							</div>
							<div className="flex items-center">
								<button
									type="button"
									aria-label={`Move ${timezone} left`}
									onClick={() => onMoveEarlier(timezone)}
									className={controlClass}
								>
									<ChevronLeftIcon />
								</button>
								<button
									type="button"
									aria-label={`Remove ${timezone}`}
									onClick={() => onRemove(timezone)}
									className={controlClass}
								>
									<TimesIcon />
								</button>
								<button
									type="button"
									aria-label={`Move ${timezone} right`}
									onClick={() => onMoveLater(timezone)}
									className={controlClass}
								>
									<ChevronRightIcon />
								</button>
							</div>
						</div>
					))}
				</div>

				{slots.map((slot, slotIndex) => {
					const isNow = slot.isSame(now.startOf("hour"));

					return (
						<div
							key={slot.toISOString()}
							ref={isNow ? nowRowRef : undefined}
							className={cn(
								"flex border-y",
								isNow ? "border-y-primary" : "border-y-transparent",
							)}
						>
							{timezones.map((timezone, rowIndex) => {
								const local = slot.tz(timezone);
								const localHour = local.hour();
								const isPicked =
									picked?.rowIndex === rowIndex &&
									picked.slotIndex === slotIndex;

								return (
									<button
										key={timezone}
										type="button"
										aria-label={`Create an event at ${local.format(
											"MMM D, HH:mm",
										)} ${timezone}`}
										onClick={() => onPick({ rowIndex, slotIndex })}
										className={cn(
											"min-w-0 flex-1 basis-0 cursor-pointer px-1 py-2.5 text-center text-sm",
											rowIndex > 0 && "border-border border-l",
											TONE_CLASS[hourTone(localHour)],
											timezone === myTimezone && "font-bold",
											isPicked && "bg-primary-highlight",
										)}
									>
										{localHour === 0 ? (
											<span className="whitespace-nowrap">
												{local.format("MMM D")}
											</span>
										) : (
											<>
												{local.format(hour12 ? "h" : "HH")}
												{hour12 && (
													<span className="ml-0.5 text-text-secondary text-xs">
														{local.format("a")}
													</span>
												)}
											</>
										)}
									</button>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
