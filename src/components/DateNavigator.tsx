import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Dayjs } from "../lib/dayjs";
import { dayjs } from "../lib/dayjs";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

const STEPS = [
	{ unit: "year", label: "Y", name: "year" },
	{ unit: "month", label: "M", name: "month" },
	{ unit: "day", label: "D", name: "day" },
] as const;

type Step = (typeof STEPS)[number];

type DateNavigatorProps = {
	/** The moment the hour grid is centred on. */
	value: Dayjs;
	/** The real current moment, used to offer a way back to it. */
	now: Dayjs;
	onChange: (value: Dayjs) => void;
};

/**
 * Steppers either side of a date picker.
 *
 * The month picker is shadcn's Calendar rather than the hand-rolled one this
 * replaced: it is a date picker, which is exactly what this needs, and it was
 * already in the tree as a dependency of the event calendar.
 */
export function DateNavigator({ value, now, onChange }: DateNavigatorProps) {
	const [open, setOpen] = useState(false);
	const isNow = value.isSame(now, "day");

	function shift(step: Step, direction: -1 | 1) {
		onChange(value.add(direction, step.unit));
	}

	function pick(date: Date | undefined) {
		if (!date) {
			return;
		}
		// Keep the time of day: only the date is being chosen here.
		const picked = dayjs(date);
		onChange(
			value.year(picked.year()).month(picked.month()).date(picked.date()),
		);
		setOpen(false);
	}

	return (
		// Two rows on a phone, reordered so the picker and Today lead and the
		// steppers sit together underneath. One row, source order, from md up.
		<div className="flex flex-wrap items-center justify-center gap-2">
			<div
				className="order-3 inline-flex gap-1 md:order-1"
				role="group"
				aria-label="Jump backwards"
			>
				{STEPS.map((step) => (
					<Button
						key={step.unit}
						variant="outline"
						size="sm"
						aria-label={`Previous ${step.name}`}
						title={`Previous ${step.name}`}
						onClick={() => shift(step, -1)}
					>
						<ChevronLeftIcon />
						{step.label}
					</Button>
				))}
			</div>

			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							variant="outline"
							size="sm"
							className="order-1 tabular-nums md:order-2"
						>
							<CalendarIcon />
							{value.format("D MMM YYYY")}
						</Button>
					}
				/>
				<PopoverContent className="w-auto p-0" align="center">
					<Calendar
						mode="single"
						selected={value.toDate()}
						defaultMonth={value.toDate()}
						onSelect={pick}
						autoFocus
					/>
				</PopoverContent>
			</Popover>

			<div
				className="order-4 inline-flex gap-1 md:order-3"
				role="group"
				aria-label="Jump forwards"
			>
				{STEPS.map((step) => (
					<Button
						key={step.unit}
						variant="outline"
						size="sm"
						aria-label={`Next ${step.name}`}
						title={`Next ${step.name}`}
						onClick={() => shift(step, 1)}
					>
						{step.label}
						<ChevronRightIcon />
					</Button>
				))}
			</div>

			<Button
				variant="ghost"
				size="sm"
				className="order-2 md:order-4"
				disabled={isNow}
				onClick={() => onChange(now)}
			>
				Today
			</Button>
		</div>
	);
}
