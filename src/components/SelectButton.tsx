import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SelectButtonOption<T extends string> = {
	label: string;
	value: T;
};

type SelectButtonProps<T extends string> = {
	id?: string;
	value: T;
	options: SelectButtonOption<T>[];
	onChange: (value: T) => void;
	ariaLabelledBy?: string;
};

/**
 * A single-choice segmented control.
 *
 * Kept as a named wrapper rather than using ToggleGroup at each call site: it
 * is used for the clock format, the grid zoom, the brush and the meeting
 * length, and the one thing they all need is that deselecting is impossible.
 */
export function SelectButton<T extends string>({
	id,
	value,
	options,
	onChange,
	ariaLabelledBy,
}: SelectButtonProps<T>) {
	return (
		<ToggleGroup
			id={id}
			variant="outline"
			size="sm"
			spacing={0}
			// Base UI's group is multi-select by nature, so single choice is a
			// one-element array in and the first element out.
			value={[value]}
			aria-labelledby={ariaLabelledBy}
			onValueChange={(next: string[]) => {
				const [chosen] = next;
				// An empty array is a deselect; there is always a current format,
				// zoom and brush, so it is ignored.
				if (chosen) {
					onChange(chosen as T);
				}
			}}
		>
			{options.map((option) => (
				<ToggleGroupItem key={option.value} value={option.value}>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
