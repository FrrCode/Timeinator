type IconProps = {
	className?: string;
};

/** Replacements for the PrimeIcons glyphs used by the timezone row actions. */

export function TimesIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<title>Remove</title>
			<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
		</svg>
	);
}

export function AngleUpIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Move up</title>
			<path d="M3.5 10l4.5-4.5L12.5 10" />
		</svg>
	);
}

export function AngleDownIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Move down</title>
			<path d="M3.5 6l4.5 4.5L12.5 6" />
		</svg>
	);
}

export function ChevronDownIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Show all time zones</title>
			<path d="M3.5 6l4.5 4.5L12.5 6" />
		</svg>
	);
}

export function ChevronLeftIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Go back</title>
			<path d="M10 3.5L5.5 8l4.5 4.5" />
		</svg>
	);
}

export function ChevronRightIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Go forward</title>
			<path d="M6 3.5L10.5 8L6 12.5" />
		</svg>
	);
}

export function ShareIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Share</title>
			<circle cx="12" cy="3.5" r="1.9" />
			<circle cx="12" cy="12.5" r="1.9" />
			<circle cx="4" cy="8" r="1.9" />
			<path d="M5.7 7.1l4.6-2.7M5.7 8.9l4.6 2.7" />
		</svg>
	);
}

export function CheckIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Copied</title>
			<path d="M3 8.5l3.5 3.5L13 5" />
		</svg>
	);
}

export function CalendarIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<title>Choose date</title>
			<rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
			<path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
		</svg>
	);
}

export function ClockIcon({ className }: IconProps) {
	return (
		<svg
			className={className}
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</svg>
	);
}
