import type { ApiParticipant } from "../lib/api.ts";
import { ParticipantChip } from "./ParticipantChip.tsx";

type ParticipantLegendProps = {
	participants: ApiParticipant[];
	meId: string | null;
};

/**
 * Who is in this poll — including the people who have marked nothing yet, who
 * are invisible on the calendar itself and are exactly the ones worth chasing.
 */
export function ParticipantLegend({
	participants,
	meId,
}: ParticipantLegendProps) {
	if (participants.length === 0) {
		return null;
	}

	return (
		<ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
			{participants.map((participant, index) => (
				<li key={participant.id}>
					<ParticipantChip
						name={participant.name}
						avatar={participant.avatar}
						index={index}
						emphasise={participant.id === meId}
						size="sm"
					/>
				</li>
			))}
		</ul>
	);
}
