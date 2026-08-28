import { type Dayjs, dayjs } from "./dayjs";

const NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5];
const WORKING_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const OFF_WORKING_HOURS = [6, 7, 18, 19, 20, 21];

/** How civil an hour is to schedule into, in its own time zone. */
export type HourTone = "working" | "off" | "night";

export function hourTone(hour: number): HourTone {
	if (WORKING_HOURS.includes(hour)) {
		return "working";
	}
	if (OFF_WORKING_HOURS.includes(hour)) {
		return "off";
	}
	if (NIGHT_HOURS.includes(hour)) {
		return "night";
	}
	return "off";
}

/**
 * Written out in full so Tailwind's scanner can see each class. The colours
 * themselves are theme tokens (`--color-hour-*` in index.css) rather than
 * literals, so the heat can be tuned in the same place as everything else.
 */
export const TONE_CLASS: Record<HourTone, string> = {
	working: "bg-hour-work",
	off: "bg-hour-fringe",
	night: "bg-hour-night",
};

/** 24 hourly slots, centred on the given hour (12 back, 11 forward). */
export function getSlots(date: Dayjs = dayjs()) {
	const start = date.utc().startOf("hour").subtract(12, "hour");
	return Array.from({ length: 24 }, (_, index) => start.add(index, "hour"));
}

/** Identifies the cell whose "create event" surface is open. */
export type PickedSlot = {
	/** Index into the watched time zones. */
	rowIndex: number;
	/** Index into the slots. */
	slotIndex: number;
};

/**
 * Everything both grid renderings need. The desktop grid lays time zones out as
 * rows of hours; the mobile grid transposes that into columns, which is why the
 * reorder callbacks are named by list position rather than by direction.
 */
export type ClockGridProps = {
	slots: Dayjs[];
	timezones: string[];
	/** The viewer's own zone, emphasised wherever it appears. */
	myTimezone: string;
	/** The moment the grid is centred on. */
	anchor: Dayjs;
	now: Dayjs;
	hour12: boolean;
	picked: PickedSlot | null;
	onPick: (picked: PickedSlot) => void;
	onClosePicked: () => void;
	onRemove: (timezone: string) => void;
	onMoveEarlier: (timezone: string) => void;
	onMoveLater: (timezone: string) => void;
};

/** "Europe/Berlin" reads as Berlin over Europe. */
export function zoneCity(timezone: string) {
	return timezone.split("/")[1] ?? timezone;
}

export function zoneRegion(timezone: string) {
	return timezone.split("/")[0] ?? "";
}

/**
 * Same city, but wrappable. Narrow columns can't fit "Los_Angeles" on one line,
 * and a real space gives the browser somewhere to break.
 */
export function zoneCityLabel(timezone: string) {
	return zoneCity(timezone).replace(/_/g, " ");
}
