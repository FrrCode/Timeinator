import type { Dayjs } from "./dayjs";

const TEMPLATE_URL = "https://calendar.google.com/calendar/render";

/** Template links want basic-format UTC stamps, e.g. 20260812T140000Z. */
function formatStamp(moment: Dayjs) {
	return moment.utc().format("YYYYMMDDTHHmmss[Z]");
}

type CalendarEvent = {
	title: string;
	start: Dayjs;
	end: Dayjs;
	details?: string;
};

/**
 * A prefilled "create event" link. Google opens its own compose screen, so
 * nothing is written to the user's calendar until they save it there.
 */
export function buildGoogleCalendarUrl({
	title,
	start,
	end,
	details,
}: CalendarEvent) {
	const params = new URLSearchParams({
		action: "TEMPLATE",
		text: title,
		dates: `${formatStamp(start)}/${formatStamp(end)}`,
	});
	if (details) {
		params.set("details", details);
	}
	return `${TEMPLATE_URL}?${params.toString()}`;
}
