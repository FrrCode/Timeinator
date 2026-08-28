import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn.ts";
import { CalendarIcon, ClockIcon } from "./icons.tsx";

const TABS = [
	{ to: "/", label: "World clock", Icon: ClockIcon },
	{ to: "/pick", label: "Pick a time", Icon: CalendarIcon },
] as const;

/**
 * The two things this app does, side by side on every page.
 *
 * `end` is set only on "/", so the world clock tab does not light up for every
 * route, while "Pick a time" stays lit on /pick/<id> as well as /pick.
 */
export function TopNav() {
	return (
		<nav
			aria-label="Sections"
			className="mb-4 border-border border-b px-3 md:px-6"
		>
			<ul className="flex gap-1">
				{TABS.map(({ to, label, Icon }) => (
					<li key={to}>
						<NavLink
							to={to}
							end={to === "/"}
							className={({ isActive }) =>
								cn(
									"-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 font-medium text-sm transition-colors",
									"focus-visible:shadow-[0_0_0_0.2rem_var(--color-primary-highlight)] focus-visible:outline-none",
									isActive
										? "border-primary text-primary"
										: "border-transparent text-muted-foreground hover:text-foreground",
								)
							}
						>
							<Icon />
							{label}
						</NavLink>
					</li>
				))}
			</ul>
		</nav>
	);
}
