import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type Identity, randomIdentity } from "../../shared/identity.ts";
import type { Kind } from "../../shared/intervals.ts";
import { applyPaint, type PaintOperation } from "../../shared/paint.ts";
import { findBlockers, findProposals } from "../../shared/proposals.ts";
import {
	AvailabilityCalendar,
	type Brush,
} from "../components/AvailabilityCalendar";
import { IdentityBar } from "../components/IdentityBar";
import { ParticipantLegend } from "../components/ParticipantLegend";
import { ProposedTimes } from "../components/ProposedTimes";
import { SelectButton } from "../components/SelectButton";
import { ShareButton } from "../components/ShareButton";
import { ZonePicker } from "../components/ZonePicker";
import {
	type ApiMark,
	joinPoll,
	saveMarks,
	updateParticipant,
} from "../lib/api.ts";
import { SITE } from "../lib/consts";
import { dayjs } from "../lib/dayjs";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { DESKTOP_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { useParticipant } from "../lib/useParticipant.ts";
import { usePoll } from "../lib/usePoll.ts";

const ZOOM_OPTIONS = [
	{ value: "15", label: "15m" },
	{ value: "30", label: "30m" },
	{ value: "60", label: "1h" },
] as const;

const LENGTH_OPTIONS = [
	{ value: "30", label: "30m" },
	{ value: "60", label: "1h" },
	{ value: "120", label: "2h" },
] as const;

const DAYS_OPTIONS = [
	{ value: "7", label: "7d" },
	{ value: "5", label: "5d" },
	{ value: "3", label: "3d" },
] as const;

const BRUSH_OPTIONS = [
	{ value: "preferred", label: "Preferred" },
	{ value: "busy", label: "Busy" },
	{ value: "erase", label: "Erase" },
] as const;

const SAVE_DEBOUNCE_MS = 500;

/** Every IANA zone the browser knows. ZonePicker owns the matching. */
const availableTimezones = Intl.supportedValuesOf("timeZone");

/** The viewer's locale answers this; a sixth control would not earn its space. */
const HOUR12 = Intl.DateTimeFormat().resolvedOptions().hour12 ?? false;

type PaintRange = { start: number; end: number };

type PendingStroke = {
	range: PaintRange;
	operation: PaintOperation;
	kind: Kind;
};

export function PickTimePage() {
	const { pollId = "" } = useParams();
	const { snapshot, error, loading, refresh, setSnapshot } = usePoll(pollId);
	const { token, participantId, remember, forget } = useParticipant(pollId);
	const isDesktop = useMediaQuery(DESKTOP_QUERY);

	const [timezone, setTimezone] = useState(() => dayjs.tz.guess());
	const [zoom, setZoom] =
		useState<(typeof ZOOM_OPTIONS)[number]["value"]>("30");
	const [length, setLength] =
		useState<(typeof LENGTH_OPTIONS)[number]["value"]>("60");
	const [brush, setBrush] = useState<Brush>("preferred");
	// Defaults to what the screen can carry — seven columns on a phone are about
	// fifty pixels each — but it is a choice, not a lock: the control is there on
	// both, and a resize never overrides what you picked.
	const [days, setDays] = useState<(typeof DAYS_OPTIONS)[number]["value"]>(
		() => (isDesktop ? "7" : "3"),
	);
	// A moment, not a week: the week it belongs to is re-derived per zone.
	const [anchor, setAnchor] = useState(() => dayjs.utc());

	const [pendingStroke, setPendingStroke] = useState<PendingStroke | null>(
		null,
	);
	// Yours from the moment the page loads; only written to the server once you
	// actually mark something, so merely opening a link does not join you.
	const [draftIdentity, setDraftIdentity] = useState<Identity>(randomIdentity);
	const [joinError, setJoinError] = useState<string | null>(null);

	const title = snapshot?.poll.title || "Pick a time";
	useDocumentTitle(`${title} — ${SITE.name}`);

	const participantIds = useMemo(
		() => snapshot?.participants.map((person) => person.id) ?? [],
		[snapshot],
	);

	const meIndex = participantId ? participantIds.indexOf(participantId) : -1;
	const me = snapshot?.participants[meIndex];
	// The stored identity once joined, the generated one before that.
	const identity: Identity = me
		? { name: me.name, avatar: me.avatar }
		: draftIdentity;

	const proposals = useMemo(
		() =>
			findProposals({
				marks: snapshot?.marks ?? [],
				participantIds,
				lengthSeconds: Number(length) * 60,
			}),
		[snapshot, participantIds, length],
	);

	// Only read by the empty state, but cheap enough not to bother deferring.
	const blockers = useMemo(
		() =>
			findBlockers({
				marks: snapshot?.marks ?? [],
				participantIds,
				lengthSeconds: Number(length) * 60,
			}),
		[snapshot, participantIds, length],
	);

	// Read by the debounced save, which must not close over a stale render.
	const myMarksRef = useRef<ApiMark[]>([]);
	useEffect(() => {
		myMarksRef.current =
			snapshot?.marks.filter((mark) => mark.participantId === participantId) ??
			[];
	}, [snapshot, participantId]);

	const saveTimer = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(saveTimer.current), []);

	const scheduleSave = useCallback(() => {
		window.clearTimeout(saveTimer.current);
		saveTimer.current = window.setTimeout(() => {
			if (!token) {
				return;
			}
			// Refresh either way: on success to pick up other people's changes, on
			// failure to replace the optimistic marks with what was actually stored.
			saveMarks(pollId, token, myMarksRef.current)
				.then(() => refresh())
				.catch(() => refresh());
		}, SAVE_DEBOUNCE_MS);
	}, [pollId, token, refresh]);

	const onPaint = useCallback(
		(range: PaintRange, operation: PaintOperation, kind: Kind) => {
			if (range.end <= range.start) {
				return;
			}
			if (!token || !participantId) {
				// You already have a name, so there is nothing to ask: join with it
				// and let the stroke land. Held in state meanwhile so it survives
				// the round trip rather than being dropped.
				setPendingStroke({ range, operation, kind });
				return;
			}

			setSnapshot((current) => {
				if (!current) {
					return current;
				}
				const mine = current.marks.filter(
					(mark) => mark.participantId === participantId,
				);
				const others = current.marks.filter(
					(mark) => mark.participantId !== participantId,
				);
				return {
					...current,
					marks: [
						...others,
						...applyPaint({
							mine,
							participantId,
							painted: [range],
							kind,
							operation,
						}),
					],
				};
			});
			scheduleSave();
		},
		[token, participantId, setSnapshot, scheduleSave],
	);

	// Joining is a side effect of the first mark, not a step of its own.
	useEffect(() => {
		if (!pendingStroke || token) {
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const joined = await joinPoll(
					pollId,
					draftIdentity.name,
					timezone,
					draftIdentity.avatar,
				);
				if (cancelled) {
					return;
				}
				remember({
					token: joined.token,
					participantId: joined.participant.id,
				});
				await saveMarks(
					pollId,
					joined.token,
					applyPaint({
						mine: [],
						participantId: joined.participant.id,
						painted: [pendingStroke.range],
						kind: pendingStroke.kind,
						operation: pendingStroke.operation,
					}),
				);
				setPendingStroke(null);
				await refresh();
			} catch {
				if (!cancelled) {
					setPendingStroke(null);
					setJoinError("Could not save that. Try again in a moment.");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		pendingStroke,
		token,
		pollId,
		draftIdentity,
		timezone,
		remember,
		refresh,
	]);

	function renameMe(next: string) {
		if (!token) {
			// Not joined yet: this is still just what the box says.
			setDraftIdentity((current) => ({ ...current, name: next }));
			return;
		}
		// Optimistic, so the input does not snap back while the request is out.
		setSnapshot((current) =>
			current
				? {
						...current,
						participants: current.participants.map((person) =>
							person.id === participantId ? { ...person, name: next } : person,
						),
					}
				: current,
		);
		void updateParticipant(pollId, token, { name: next }).catch(() =>
			refresh(),
		);
	}

	function changeTimezone(next: string) {
		setTimezone(next);
		if (token) {
			// Best effort: the grid already re-renders, and a failed PATCH only
			// means the zone is not remembered for the next visit.
			void updateParticipant(pollId, token, { timezone: next }).catch(() => {});
		}
	}

	if (loading) {
		return <p className="p-8 text-center text-text-secondary">Loading…</p>;
	}

	if (error || !snapshot) {
		return (
			<div className="p-8 text-center">
				<p className="mb-3 text-text-secondary">
					This poll doesn&apos;t exist, or the link is incomplete.
				</p>
				<Link to="/pick" className="text-sm underline">
					Start a new one
				</Link>
			</div>
		);
	}

	const shareUrl = `${window.location.origin}/pick/${pollId}`;

	return (
		<div className="mx-auto flex w-full max-w-[1200px] flex-col px-3 md:h-[calc(100dvh-3.5rem)] md:px-6">
			{/* ~10%: title, who you are, and the controls. Fixed on desktop so the
			    two panes below can divide what is left. */}
			<div className="shrink-0">
				{joinError && (
					<p role="alert" className="mt-2 text-busy text-sm">
						{joinError}
					</p>
				)}
				<div className="flex flex-wrap items-center justify-between gap-2 py-3">
					<h1 className="font-bold text-2xl md:text-3xl">{title}</h1>
					<IdentityBar
						name={identity.name}
						avatar={identity.avatar}
						index={meIndex}
						onNameChange={renameMe}
					/>
				</div>

				<div className="mb-3 flex flex-wrap items-end gap-2">
					<div className="min-w-[12rem] flex-1">
						<ZonePicker
							timezones={availableTimezones}
							placeholder={timezone}
							onSelect={changeTimezone}
						/>
					</div>
					<SelectButton
						value={brush}
						options={[...BRUSH_OPTIONS]}
						onChange={(value) => setBrush(value)}
						ariaLabelledBy="brush-label"
					/>
					<SelectButton
						value={zoom}
						options={[...ZOOM_OPTIONS]}
						onChange={setZoom}
						ariaLabelledBy="zoom-label"
					/>
					<span id="zoom-label" className="sr-only">
						Slot size
					</span>
					<SelectButton
						value={days}
						options={[...DAYS_OPTIONS]}
						onChange={setDays}
						ariaLabelledBy="days-label"
					/>
					<span id="days-label" className="sr-only">
						Days shown
					</span>
					<ShareButton url={shareUrl} />
				</div>
				<span id="brush-label" className="sr-only">
					What you are marking
				</span>

				<p className="mb-3 text-sm text-text-secondary">
					Showing <strong>{timezone}</strong>. Tap a slot to mark it, or drag
					down a day for a range — straight over anyone else&apos;s marks.
					Switch to Erase to take yours back.
				</p>

				<div className="mb-2">
					<ParticipantLegend
						participants={snapshot.participants}
						meId={participantId}
					/>
				</div>
			</div>

			{/* ~60%: the calendar scrolls inside this box rather than the page, which
			    is what keeps its day headers stuck to the top while you scroll. On a
			    phone the page scrolls instead, so the box gets an explicit height. */}
			<div className="flex h-[70dvh] min-h-0 flex-col md:h-auto md:min-h-0 md:flex-[6]">
				<AvailabilityCalendar
					marks={snapshot.marks}
					participants={snapshot.participants}
					meId={participantId}
					timezone={timezone}
					zoomMinutes={Number(zoom)}
					visibleDays={Number(days)}
					brush={brush}
					date={anchor.toDate()}
					onDateChange={(next) => setAnchor(dayjs(next).utc())}
					onPaint={onPaint}
				/>
			</div>

			{/* ~30%: visible without scrolling the page, and scrolls internally when
			    there are more windows than fit. */}
			<div className="mt-4 flex min-h-0 flex-col pb-6 md:mt-3 md:flex-[3] md:pb-3">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
					<h2 className="font-bold text-xl">Works for everyone</h2>
					<SelectButton
						value={length}
						options={[...LENGTH_OPTIONS]}
						onChange={setLength}
						ariaLabelledBy="length-label"
					/>
					<span id="length-label" className="sr-only">
						Meeting length
					</span>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto">
					<ProposedTimes
						proposals={proposals}
						blockers={blockers}
						participants={snapshot.participants}
						timezone={timezone}
						hour12={HOUR12}
						title={snapshot.poll.title}
					/>
				</div>

				{participantId && (
					<button
						type="button"
						onClick={forget}
						className="mt-6 cursor-pointer text-sm text-text-secondary underline"
					>
						Not you? Start over
					</button>
				)}
			</div>
		</div>
	);
}
