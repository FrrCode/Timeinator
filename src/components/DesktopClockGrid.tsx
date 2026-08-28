import { useState } from "react";
import { cn } from "../lib/cn";
import {
	type ClockGridProps,
	hourTone,
	TONE_CLASS,
	zoneCity,
	zoneCityLabel,
	zoneRegion,
} from "../lib/grid";
import { CreateEventPopover } from "./CreateEventPopover";
import { AngleDownIcon, AngleUpIcon, TimesIcon } from "./icons";

/** Keep the event popover inside the page when the cell is near either end. */
function popoverAlign(slotIndex: number, slotCount: number) {
	if (slotIndex < 4) {
		return "start" as const;
	}
	if (slotIndex > slotCount - 5) {
		return "end" as const;
	}
	return "center" as const;
}

/**
 * One row per time zone, one column per hour.
 *
 * A single CSS grid rather than a stack of independent flex rows: that is what
 * makes every column line up across zones and lets the current-hour outline run
 * unbroken from the header to the last row. Rows touch, so there is nothing for
 * a column highlight to fall through.
 *
 * Every cell is tinted by how civil that hour is in its own zone, permanently —
 * one pass down a column answers "who is awake for this?" without touching
 * anything. Hover lights the whole column instead, so a single hour can still
 * be traced across every zone.
 */
export function DesktopClockGrid({
	slots,
	timezones,
	myTimezone,
	anchor,
	now,
	hour12,
	picked,
	onPick,
	onClosePicked,
	onRemove,
	onMoveEarlier,
	onMoveLater,
}: ClockGridProps) {
	const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
	const nowHour = now.startOf("hour");

	return (
		/* Dropping the column crosshair when the pointer leaves the table is
		   pointer-only by nature; its keyboard equivalent is the onFocus already on
		   every cell button, and making this wrapper focusable would add a tab stop
		   that does nothing. */
		// biome-ignore lint/a11y/noStaticElementInteractions: see above
		<div
			// Deliberately not overflow-hidden: the create-event popover is
			// absolutely positioned inside a cell, and a clipping frame swallows it.
			// The four corner cells round themselves instead.
			className="rounded-lg border border-border"
			onMouseLeave={() => setHoveredSlot(null)}
		>
			<div
				className="grid"
				style={{
					gridTemplateColumns: `11rem repeat(${slots.length}, minmax(0, 1fr))`,
				}}
			>
				{/* Header: the hour in the reference zone, so the columns are labelled
				    by something rather than counted. */}
				<div className="rounded-tl-lg border-border border-b bg-muted/40" />
				{slots.map((slot, slotIndex) => {
					const reference = timezones[0];
					return (
						<div
							key={`head-${slot.toISOString()}`}
							className={cn(
								"border-border border-b bg-muted/40 py-1.5 text-center font-medium text-[10px] text-muted-foreground uppercase tracking-wider tabular-nums",
								slotIndex === slots.length - 1 && "rounded-tr-lg",
								slot.isSame(nowHour) && "text-primary",
								hoveredSlot === slotIndex && "bg-primary/10",
							)}
						>
							{reference
								? slot.tz(reference).format(hour12 ? "h" : "HH")
								: slot.format("HH")}
						</div>
					);
				})}

				{timezones.map((timezone, rowIndex) => {
					const isReference = rowIndex === 0;
					const isLastRow = rowIndex === timezones.length - 1;

					return [
						<div
							key={`label-${timezone}`}
							className={cn(
								"group/row flex items-center justify-between gap-2 border-border border-r px-3 py-2",
								isLastRow ? "rounded-bl-lg" : "border-b",
								!isReference && "text-text-secondary",
							)}
						>
							<div className="min-w-0">
								<div
									className={cn(
										"truncate font-semibold text-sm leading-tight",
										timezone === myTimezone && "font-bold",
									)}
									title={timezone}
								>
									{zoneCityLabel(timezone)}
								</div>
								<div className="truncate text-[11px] text-muted-foreground leading-tight">
									{zoneRegion(timezone)} ·{" "}
									<span className="tabular-nums">
										{anchor.tz(timezone).format(hour12 ? "h:mm a" : "HH:mm")}
									</span>
								</div>
							</div>

							{/* Revealed on hover: three permanent icons per row was most of
							    the visual noise in the old layout. Focus-within keeps them
							    reachable from the keyboard. */}
							<div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
								<button
									type="button"
									aria-label={`Move ${zoneCity(timezone)} up`}
									onClick={() => onMoveEarlier(timezone)}
									className="cursor-pointer text-muted-foreground text-xs hover:text-primary"
								>
									<AngleUpIcon />
								</button>
								<button
									type="button"
									aria-label={`Move ${zoneCity(timezone)} down`}
									onClick={() => onMoveLater(timezone)}
									className="cursor-pointer text-muted-foreground text-xs hover:text-primary"
								>
									<AngleDownIcon />
								</button>
							</div>
							<button
								type="button"
								aria-label={`Remove ${zoneCity(timezone)}`}
								onClick={() => onRemove(timezone)}
								className="shrink-0 cursor-pointer text-muted-foreground text-xs opacity-0 transition-opacity hover:text-primary group-hover/row:opacity-100 group-focus-within/row:opacity-100"
							>
								<TimesIcon />
							</button>
						</div>,

						...slots.map((slot, slotIndex) => {
							const local = slot.tz(timezone);
							const localHour = local.hour();
							const isNow = slot.isSame(nowHour);
							const isHovered = hoveredSlot === slotIndex;
							const isPicked =
								picked?.rowIndex === rowIndex && picked.slotIndex === slotIndex;
							const startsDay = localHour === 0;

							return (
								<div
									key={`${timezone}-${slot.toISOString()}`}
									className={cn(
										"relative border-border",
										!isLastRow && "border-b",
									)}
								>
									<button
										type="button"
										aria-label={`Create an event at ${local.format(
											"MMM D, HH:mm",
										)} ${timezone}`}
										onMouseOver={() => setHoveredSlot(slotIndex)}
										onFocus={() => setHoveredSlot(slotIndex)}
										onClick={() => onPick({ rowIndex, slotIndex })}
										className={cn(
											"flex h-full w-full cursor-pointer flex-col items-center justify-center py-2 text-center text-sm leading-none tabular-nums transition-colors",
											isLastRow &&
												slotIndex === slots.length - 1 &&
												"rounded-br-lg",
											TONE_CLASS[hourTone(localHour)],
											!isReference && "text-text-secondary",
											timezone === myTimezone && "font-semibold",
											// The crosshair rides on top of the heat rather than
											// replacing it, so the tint stays readable underneath.
											isHovered &&
												"shadow-[inset_0_0_0_999px_rgba(33,150,243,0.10)]",
											isNow &&
												"shadow-[inset_1px_0_0_var(--color-primary),inset_-1px_0_0_var(--color-primary)]",
											isNow && isHovered && "shadow-none bg-primary/15",
											isPicked && "bg-primary/25",
										)}
									>
										{/* The date sits above the hour rather than beside it, so a
										    day boundary never gives one row a second line and
										    knocks every other row out of alignment. */}
										{startsDay && (
											<span className="block text-[9px] text-muted-foreground leading-none">
												{local.format("MMM D")}
											</span>
										)}
										<span className={cn(startsDay && "mt-0.5")}>
											{local.format(hour12 ? "h" : "HH")}
											{hour12 && (
												<span className="ml-0.5 text-[10px] text-muted-foreground">
													{local.format("a")}
												</span>
											)}
										</span>
									</button>

									{isPicked && (
										<CreateEventPopover
											start={slot}
											timezone={timezone}
											timezones={timezones}
											hour12={hour12}
											align={popoverAlign(slotIndex, slots.length)}
											onClose={onClosePicked}
										/>
									)}
								</div>
							);
						}),
					];
				})}
			</div>
		</div>
	);
}
