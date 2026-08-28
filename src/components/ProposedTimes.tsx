import { Button } from "@/components/ui/button";
import type { Blocker, Proposal } from "../../shared/proposals.ts";
import type { ApiParticipant } from "../lib/api.ts";
import { dayjs } from "../lib/dayjs.ts";
import { buildGoogleCalendarUrl } from "../lib/googleCalendar.ts";
import { CalendarIcon } from "./icons.tsx";

type ProposedTimesProps = {
	proposals: Proposal[];
	/** Only consulted when `proposals` is empty: who to go and ask. */
	blockers: Blocker[];
	participants: ApiParticipant[];
	timezone: string;
	hour12: boolean;
	/** The poll's title, used as the calendar event's summary. */
	title: string;
};

function nameList(participants: ApiParticipant[], ids: string[]) {
	const names = ids
		.map((id) => participants.find((person) => person.id === id)?.name)
		.filter((name): name is string => Boolean(name));
	if (names.length <= 1) {
		return names.join("");
	}
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function ProposedTimes({
	proposals,
	blockers,
	participants,
	timezone,
	hour12,
	title,
}: ProposedTimesProps) {
	if (participants.length === 0) {
		return (
			<p className="py-6 text-center text-muted-foreground">
				Nobody has marked anything yet. Paint some green and share the link.
			</p>
		);
	}

	if (proposals.length === 0) {
		// A dead end is only useful if it says who to go and ask.
		const worst = blockers.slice(0, 2).map((blocker) => blocker.participantId);
		return (
			<p className="py-6 text-center text-muted-foreground">
				{worst.length > 0
					? `No window works yet. ${nameList(participants, worst)} ${
							worst.length === 1 ? "is" : "are"
						} busy across most of the times somebody wanted.`
					: "No window works yet — nobody has marked a preferred slot."}
			</p>
		);
	}

	const timeFormat = hour12 ? "h:mm A" : "HH:mm";

	return (
		<ul className="flex flex-col gap-2">
			{proposals.map((proposal) => {
				const start = dayjs.unix(proposal.start).tz(timezone);
				const end = dayjs.unix(proposal.end).tz(timezone);
				const unanimous = proposal.preferredBy.length === participants.length;

				return (
					<li
						key={proposal.start}
						className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
					>
						<div className="min-w-0">
							<p className="font-medium">
								{start.format("ddd D MMM")}, {start.format(timeFormat)} –{" "}
								{end.format(timeFormat)}
							</p>
							<p className="text-sm text-text-secondary">
								{unanimous
									? `Everyone prefers this · ${proposal.preferredBy.length}/${participants.length}`
									: `${nameList(participants, proposal.preferredBy)} prefer${
											proposal.preferredBy.length === 1 ? "s" : ""
										} this · ${proposal.preferredBy.length}/${participants.length}`}
								{proposal.silent.length > 0 &&
									` · ${nameList(participants, proposal.silent)} ${
										proposal.silent.length === 1 ? "hasn't" : "haven't"
									} marked`}
							</p>
						</div>

						<Button
							variant="outline"
							size="sm"
							className="shrink-0"
							render={
								<a
									target="_blank"
									rel="noreferrer"
									href={buildGoogleCalendarUrl({
										title: title || "Meeting",
										start,
										end,
										details: `Proposed by Timeinator. Preferred by ${
											nameList(participants, proposal.preferredBy) ||
											"nobody yet"
										}.`,
									})}
								/>
							}
						>
							<CalendarIcon />
							<span className="hidden md:inline">Create event</span>
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
