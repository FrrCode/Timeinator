import { useMemo } from "react";
import { EventCalendar } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav";
import type {
	CalendarEvent,
	EventCalendarSlotDraft,
	EventCalendarSlotInfo,
} from "@/components/reui/event-calendar/event-calendar-types";
import type { Kind } from "../../shared/intervals.ts";
import type { PaintOperation } from "../../shared/paint.ts";
import type { ApiMark, ApiParticipant } from "../lib/api.ts";

/**
 * How strongly a block reads.
 *
 * Yours at full strength, everyone else's mixed toward white — same two hues,
 * so red still means busy and green still means preferred, but a glance
 * separates what you have said from what you are being told. Mixing toward
 * white rather than dropping opacity keeps a muted block opaque, so overlapping
 * neighbours do not compound into a third colour.
 */
function markColor(kind: Kind, mine: boolean) {
	const base = kind === "busy" ? "--color-busy" : "--color-preferred";
	return mine ? `var(${base})` : `color-mix(in oklch, var(${base}) 38%, white)`;
}

/**
 * The span a tap on the grid should mark.
 *
 * Taps matter more than they look: the library only activates its create-drag
 * on a touch pointer after a 250ms hold, and cancels if the finger moves first,
 * so on a phone a tap ends too early and a drag reads as a scroll. Without this
 * the page cannot be used on a phone at all.
 *
 * The grid supplies an end for timed slots, and that end is exactly the cell
 * that was tapped — widening it to the zoom step would mark time nobody chose.
 * The step is the fallback only when there is no end to honour.
 */
export function rangeFromSlot(
	slot: { date: Date; end?: Date },
	zoomMinutes: number,
) {
	const start = Math.floor(slot.date.getTime() / 1000);
	const supplied = slot.end ? Math.floor(slot.end.getTime() / 1000) : start;
	return {
		start,
		end: supplied > start ? supplied : start + zoomMinutes * 60,
	};
}

/** What each rendered block carries back when someone clicks it. */
type MarkData = {
	participantId: string;
	kind: Kind;
};

/** What a drag does. "erase" removes your own marks of either kind. */
export type Brush = Kind | "erase";

type AvailabilityCalendarProps = {
	marks: ApiMark[];
	participants: ApiParticipant[];
	/** Your own marks read at full strength; everyone else's are muted. */
	meId: string | null;
	/** IANA zone the whole grid is drawn in — not the browser's. */
	timezone: string;
	/** Row height in minutes: 15, 30 or 60. */
	zoomMinutes: number;
	/** 7 on a desktop; 3 on a phone, where seven columns are 50px each. */
	visibleDays: number;
	brush: Brush;
	/** The week to show; the calendar owns stepping and reports back. */
	date: Date;
	onDateChange: (next: Date) => void;
	onPaint: (
		range: { start: number; end: number },
		operation: PaintOperation,
		kind: Kind,
	) => void;
};

/**
 * The shared availability week.
 *
 * Everything below this component still speaks in UTC epoch seconds; the
 * calendar speaks in `Date`. The conversion happens here and nowhere else, so
 * the interval maths in `shared/` never has to know a calendar library exists.
 */
export function AvailabilityCalendar({
	marks,
	participants,
	meId,
	timezone,
	zoomMinutes,
	visibleDays,
	brush,
	date,
	onDateChange,
	onPaint,
}: AvailabilityCalendarProps) {
	/**
	 * Blocks are red or green for busy or preferred, so the person cannot also be
	 * a colour there. The avatar carries identity onto the calendar instead, and
	 * the roster underneath maps it to a colour and a name.
	 */
	const labelById = useMemo(
		() =>
			new Map(
				participants.map((person) => [
					person.id,
					`${person.avatar || "🙂"} ${person.name}`,
				]),
			),
		[participants],
	);

	const events = useMemo<CalendarEvent<MarkData>[]>(
		() =>
			marks.map((mark) => ({
				// Stable across re-renders and unique per stored row: the server
				// normalizes, so one participant never has two marks of one kind
				// starting at the same second.
				id: `${mark.participantId}:${mark.kind}:${mark.start}`,
				title: labelById.get(mark.participantId) ?? "Someone",
				start: new Date(mark.start * 1000),
				end: new Date(mark.end * 1000),
				color: markColor(mark.kind, mark.participantId === meId),
				// Your own can be stretched by their edges; moving one bodily is
				// still off, because sliding availability sideways is never what
				// somebody meant to do. Everyone else's are untouchable.
				readOnly: mark.participantId !== meId,
				draggable: false,
				resizable: mark.participantId === meId,
				// Busy packs in front, so a slot that is ruled out reads as ruled out.
				priority: mark.kind === "busy" ? 2 : 1,
				data: { participantId: mark.participantId, kind: mark.kind },
			})),
		[marks, labelById, meId],
	);

	function paint(range: { start: number; end: number }) {
		// A clear removes both kinds under the stroke, so the kind is immaterial.
		onPaint(
			range,
			brush === "erase" ? "clear" : "apply",
			brush === "erase" ? "preferred" : brush,
		);
	}

	function selectSlot(slot: EventCalendarSlotDraft) {
		// The draft is the drag rectangle, so it is always a real range.
		paint({
			start: Math.floor(slot.start.getTime() / 1000),
			end: Math.floor(slot.end.getTime() / 1000),
		});
	}

	function clickSlot(slot: EventCalendarSlotInfo) {
		paint(rangeFromSlot(slot, zoomMinutes));
	}

	/**
	 * A resized mark is the old span cleared and the new one applied.
	 *
	 * Two calls rather than a bespoke path: `onPaint` composes, so the second
	 * builds on the first, and the page debounces them into a single save.
	 */
	function resizeMark(update: {
		event: { start: Date; end: Date; data?: MarkData };
		start: Date;
		end: Date;
	}) {
		const data = update.event.data;
		if (!meId || data?.participantId !== meId) {
			return false;
		}
		const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
		onPaint(
			{ start: seconds(update.event.start), end: seconds(update.event.end) },
			"clear",
			data.kind,
		);
		onPaint(
			{ start: seconds(update.start), end: seconds(update.end) },
			"apply",
			data.kind,
		);
	}

	return (
		<EventCalendar<MarkData>
			// Seven columns on a phone are 50px each, with the day names truncated
			// to "M…"; three are tappable.
			view={visibleDays >= 7 ? "week" : "days"}
			views={[visibleDays >= 7 ? "week" : "days"]}
			dayCount={visibleDays}
			date={date}
			onDateChange={onDateChange}
			timeZone={timezone}
			weekStartsOn={1}
			// The whole day, always: hiding the night would hide the middle of
			// somebody else's working day, which is the point of this tool.
			dayStartHour={0}
			dayEndHour={24}
			slotDuration={zoomMinutes}
			snapDuration={zoomMinutes}
			events={events}
			interactions={{ drag: false, resize: true, selectSlot: true }}
			onSelectSlot={selectSlot}
			onSlotClick={clickSlot}
			onEventUpdate={resizeMark}
			classNames={{
				// The library starts a slot drag only when the press lands on the day
				// column itself, so a block under the cursor swallows the gesture --
				// which made it impossible to mark a slot somebody had already marked.
				// Letting presses fall through restores that; clearing is the Erase
				// brush rather than a click, which also clears a range instead of a
				// whole block.
				event: "pointer-events-none",
				// ...except the resize handles, which are the one part of a block
				// that must still receive a pointer. Upstream they are 6px tall and
				// only appear on hover, so on a phone they are both invisible and
				// unhittable; this makes them a real target and always visible.
				// Sized by pointer type: a 16px grab area top AND bottom would eat a
				// whole 30-minute block, leaving no body to paint through. A mouse
				// does not need one that big; a finger does.
				resizeHandle:
					"pointer-events-auto h-2 touch-none opacity-100 pointer-coarse:h-4",
				resizeGrip: "h-1 w-8 bg-foreground/30",
			}}
			className="rounded-saga border border-border"
		>
			{/* The page owns the day count, and its control offers five as well as
			    seven and three, which this switcher cannot. Two ways to change the
			    same thing, one of them worse, is worse than one. */}
			<EventCalendarNav showViewSwitcher={false} />
			<EventCalendarContent />
		</EventCalendar>
	);
}
