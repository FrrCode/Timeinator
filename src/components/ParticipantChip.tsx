import { participantColor } from "../../shared/identity.ts";
import { cn } from "../lib/cn.ts";

type ParticipantChipProps = {
	name: string;
	avatar: string;
	/** Position in the roster; the colour is keyed off it. */
	index: number;
	emphasise?: boolean;
	size?: "sm" | "md";
};

/**
 * A person, wherever one needs naming: emoji on a disc of their colour, then
 * the name in the same colour.
 *
 * The colour identifies the person and nothing else — the calendar's own blocks
 * stay red and green for busy and preferred, because those answer a different
 * question and two colour languages in one grid is one too many.
 */
export function ParticipantChip({
	name,
	avatar,
	index,
	emphasise = false,
	size = "md",
}: ParticipantChipProps) {
	const color = participantColor(index);

	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden="true"
				className={cn(
					"inline-flex shrink-0 items-center justify-center rounded-full",
					size === "sm" ? "h-4 w-4 text-[10px]" : "h-6 w-6 text-sm",
				)}
				// A tint rather than the flat colour: an emoji on a saturated disc
				// loses its own colours.
				style={{
					backgroundColor: `${color}22`,
					boxShadow: `0 0 0 1px ${color}`,
				}}
			>
				{avatar || "🙂"}
			</span>
			<span
				className={cn("truncate", emphasise && "font-semibold")}
				style={{ color }}
			>
				{name}
			</span>
		</span>
	);
}
