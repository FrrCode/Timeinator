import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "../lib/cn";
import { zoneCityLabel, zoneRegion } from "../lib/grid";
import { normalizeForSearch } from "../lib/search";
import { ChevronDownIcon } from "./icons";

/** More than fits a popover; past this the list stops being a list. */
const MAX_RESULTS = 50;

/**
 * Zones matching `query`, ignoring case, spaces and punctuation.
 *
 * Exported so it can be tested directly, and used in place of Command's own
 * fuzzy filter: the documented behaviour is that "new york", "NEW-YORK" and
 * "america/new_york" all find the same zone, which a fuzzy matcher would
 * quietly change.
 */
export function matchTimezones(timezones: string[], query: string) {
	const normalized = normalizeForSearch(query);
	const matches = normalized
		? timezones.filter((timezone) =>
				normalizeForSearch(timezone).includes(normalized),
			)
		: timezones;
	return matches.slice(0, MAX_RESULTS);
}

type ZonePickerProps = {
	timezones: string[];
	/** Already-watched zones, shown as unavailable rather than hidden. */
	selected?: string[];
	placeholder?: string;
	onSelect: (timezone: string) => void;
};

export function ZonePicker({
	timezones,
	selected = [],
	placeholder = "Add a time zone…",
	onSelect,
}: ZonePickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const results = useMemo(
		() => matchTimezones(timezones, query),
		[timezones, query],
	);

	function choose(timezone: string) {
		onSelect(timezone);
		setQuery("");
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between font-normal text-muted-foreground sm:w-64"
					>
						{placeholder}
						<ChevronDownIcon className="opacity-50" />
					</Button>
				}
			/>
			<PopoverContent
				className="w-[min(20rem,calc(100vw-2rem))] p-0"
				align="start"
			>
				{/* shouldFilter={false}: matchTimezones above is the matcher. */}
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search time zone…"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList>
						<CommandEmpty>No time zone matches that.</CommandEmpty>
						<CommandGroup>
							{results.map((timezone) => {
								const already = selected.includes(timezone);
								return (
									<CommandItem
										key={timezone}
										value={timezone}
										disabled={already}
										onSelect={() => !already && choose(timezone)}
										className={cn(
											"flex items-baseline justify-between gap-3",
											already && "opacity-50",
										)}
									>
										<span className="truncate">{zoneCityLabel(timezone)}</span>
										<span className="shrink-0 text-muted-foreground text-xs">
											{already ? "added" : zoneRegion(timezone)}
										</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
