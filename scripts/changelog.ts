/**
 * Writes CHANGELOG.md from the git history. Nothing else writes it.
 *
 *     node scripts/changelog.ts                 rewrite CHANGELOG.md
 *     node scripts/changelog.ts --check         exit 1 if CHANGELOG.md is stale
 *     node scripts/changelog.ts --notes v1.2.3  print one release's body
 *
 * Each commit subject is read as a Conventional Commit and filed under the
 * newest `v*` tag at or above it; anything past the newest tag is Unreleased.
 * A subject that does not parse still appears, under "Other", so nothing
 * vanishes because someone forgot the format.
 *
 * `--notes` renders from the history too, not by cutting a section back out of
 * the markdown, so the GitHub release and the file cannot drift apart.
 *
 * Dependency-free on purpose: CI runs it with nothing but a checkout that has
 * the full history and tags (`fetch-depth: 0`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "CHANGELOG.md");

/** Heading per type, in the order sections appear. */
const GROUPS: [string, string[]][] = [
	["Features", ["feat"]],
	["Bug fixes", ["fix"]],
	["Performance", ["perf"]],
	["Refactoring", ["refactor"]],
	["Documentation", ["docs"]],
	["Reverts", ["revert"]],
	["Maintenance", ["build", "ci", "chore", "style", "test"]],
];

const SUBJECT =
	/^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<text>.+)$/;

/**
 * Commits that describe the release process rather than the project: the
 * release bump itself (whose tag still opens the section) and CI's own
 * changelog commit.
 */
const NOISE = /^chore\((?:release|changelog)\)/;

type Commit = {
	sha: string;
	subject: string;
	body: string;
};

type Entry = {
	sha: string;
	group: string;
	scope?: string;
	text: string;
	breaking: boolean;
};

type Release = {
	/** `undefined` for Unreleased. */
	tag?: string;
	date?: string;
	previous?: string;
	entries: Entry[];
};

function git(...args: string[]) {
	return execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		// Tag dates are printed in UTC so CI and a laptop agree on the file.
		env: { ...process.env, TZ: "UTC" },
	});
}

/** `https://github.com/owner/repo`, from either an ssh or an https remote. */
function repoUrl() {
	let remote: string;
	try {
		remote = git("remote", "get-url", "origin").trim();
	} catch {
		return undefined;
	}
	const match =
		remote.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/) ??
		remote.match(
			/^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/,
		);
	return match ? `https://${match[1]}/${match[2]}` : undefined;
}

/** Tag name and date, keyed by the commit each `v*` tag points at. */
function readTags() {
	const tags = new Map<string, { tag: string; date: string }>();
	const lines = git(
		"tag",
		"--list",
		"v*",
		"--format=%(refname:short)%09%(objectname)%09%(*objectname)%09%(creatordate:format-local:%Y-%m-%d)",
	);
	for (const line of lines.split("\n").filter(Boolean)) {
		const [tag, object, peeled, date] = line.split("\t");
		// Annotated tags point at a tag object; `*objectname` is its commit.
		tags.set(peeled || object, { tag, date });
	}
	return tags;
}

function readCommits(): Commit[] {
	const log = git("log", "--topo-order", "--format=%H%x1f%s%x1f%b%x1e", "HEAD");
	return log
		.split("\x1e")
		.map((record) => record.replace(/^\n/, ""))
		.filter(Boolean)
		.map((record) => {
			const [sha, subject, body] = record.split("\x1f");
			return { sha, subject, body: body ?? "" };
		});
}

function parse(commit: Commit): Entry {
	const match = commit.subject.match(SUBJECT);
	const breaking = /^BREAKING[ -]CHANGE:/m.test(commit.body);
	const group = GROUPS.find(([, types]) =>
		types.includes(match?.groups?.type ?? ""),
	)?.[0];
	if (!match?.groups || !group) {
		return { sha: commit.sha, group: "Other", text: commit.subject, breaking };
	}
	return {
		sha: commit.sha,
		group,
		scope: match.groups.scope,
		text: match.groups.text,
		breaking: breaking || Boolean(match.groups.bang),
	};
}

/** Newest first, Unreleased at the top. */
function collectReleases(): Release[] {
	const tags = readTags();
	const releases: Release[] = [{ entries: [] }];
	for (const commit of readCommits()) {
		const tagged = tags.get(commit.sha);
		if (tagged) {
			releases.push({ ...tagged, entries: [] });
		}
		if (!NOISE.test(commit.subject)) {
			releases[releases.length - 1].entries.push(parse(commit));
		}
	}
	for (let index = 0; index < releases.length - 1; index++) {
		releases[index].previous = releases[index + 1].tag;
	}
	return releases;
}

function compareUrl(release: Release, repo: string) {
	const head = release.tag ?? "HEAD";
	if (release.previous) {
		return `${repo}/compare/${release.previous}...${head}`;
	}
	return release.tag ? `${repo}/releases/tag/${release.tag}` : undefined;
}

function renderEntry(entry: Entry, repo: string | undefined) {
	const scope = entry.scope ? `**${entry.scope}:** ` : "";
	const short = entry.sha.slice(0, 7);
	const link = repo
		? ` ([${short}](${repo}/commit/${entry.sha}))`
		: ` (${short})`;
	return `- ${scope}${entry.text}${link}`;
}

/**
 * The section without its `##` heading: what a GitHub release shows. Breaking
 * changes are moved to the top rather than listed twice.
 */
function renderBody(release: Release, repo: string | undefined) {
	const blocks: string[] = [];
	const breaking = release.entries.filter((entry) => entry.breaking);
	if (breaking.length > 0) {
		blocks.push(
			[
				"### ⚠ Breaking changes",
				"",
				...breaking.map((e) => renderEntry(e, repo)),
			].join("\n"),
		);
	}
	for (const group of [...GROUPS.map(([name]) => name), "Other"]) {
		const entries = release.entries.filter(
			(entry) => entry.group === group && !entry.breaking,
		);
		if (entries.length > 0) {
			blocks.push(
				[`### ${group}`, "", ...entries.map((e) => renderEntry(e, repo))].join(
					"\n",
				),
			);
		}
	}
	return blocks.join("\n\n");
}

function renderFile(releases: Release[], repo: string | undefined) {
	const parts = [
		[
			"# Changelog",
			"",
			"Generated from the commit history by `scripts/changelog.ts`; edits here",
			"are overwritten. The format follows",
			"[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow",
			"[Semantic Versioning](https://semver.org/spec/v2.0.0.html).",
		].join("\n"),
	];
	const links: string[] = [];
	for (const release of releases) {
		const name = release.tag ?? "Unreleased";
		const url = repo ? compareUrl(release, repo) : undefined;
		const heading = url ? `[${name}]` : name;
		const date = release.date ? ` - ${release.date}` : "";
		const body = renderBody(release, repo);
		parts.push(
			body ? `## ${heading}${date}\n\n${body}` : `## ${heading}${date}`,
		);
		if (url) {
			links.push(`[${name}]: ${url}`);
		}
	}
	if (links.length > 0) {
		parts.push(links.join("\n"));
	}
	return `${parts.join("\n\n")}\n`;
}

function main(args: string[]) {
	const repo = repoUrl();
	const releases = collectReleases();

	if (args[0] === "--notes") {
		const tag = args[1];
		const release = releases.find((candidate) => candidate.tag === tag);
		if (!tag || !release) {
			console.error(`error: no release ${tag ?? "(none given)"} in history`);
			return 1;
		}
		const body = renderBody(release, repo) || "_No user-facing changes._";
		const url = repo ? compareUrl(release, repo) : undefined;
		const footer =
			url && release.previous ? `\n\n**Full changelog:** ${url}` : "";
		process.stdout.write(`${body}${footer}\n`);
		return 0;
	}

	const content = renderFile(releases, repo);

	if (args[0] === "--check") {
		let current = "";
		try {
			current = readFileSync(FILE, "utf8");
		} catch {}
		if (current !== content) {
			console.error("CHANGELOG.md is stale; run `just changelog`.");
			return 1;
		}
		return 0;
	}

	if (args.length > 0) {
		console.error("usage: changelog.ts [--check | --notes <tag>]");
		return 2;
	}

	writeFileSync(FILE, content);
	return 0;
}

process.exit(main(process.argv.slice(2)));
