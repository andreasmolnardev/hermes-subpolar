#!/usr/bin/env bun

type Options = {
  readonly dryRun: boolean;
  readonly publish: boolean;
  readonly tag?: string;
};

const root = new URL("..", import.meta.url).pathname;

function usage(): never {
  console.error(`Usage: bun scripts/release.ts [--dry-run] [--publish] [--tag vX.Y.Z]`);
  process.exit(2);
}

function options(): Options {
  const args = Bun.argv.slice(2);
  let dryRun = true;
  let publish = false;
  let tag: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--publish") {
      publish = true;
      dryRun = false;
    } else if (argument === "--tag") {
      tag = args[index + 1];
      if (tag === undefined || !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) usage();
      index += 1;
    } else if (argument === "--help" || argument === "-h") usage();
    else usage();
  }

  if (dryRun && publish) usage();
  return { dryRun, publish, ...(tag === undefined ? {} : { tag }) };
}

function run(command: string, args: readonly string[]): string {
  const result = Bun.spawnSync([command, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    const error = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`${command} ${args.join(" ")} failed${error ? `: ${error}` : ""}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function releaseNotes(previousTag: string | undefined): string {
  const range = previousTag === undefined ? "HEAD" : `${previousTag}..HEAD`;
  const log = run("git", ["log", range, "--no-merges", "--pretty=format:%s (%h)"]);
  if (!log) return "No user-facing changes were recorded.";

  const groups = new Map<string, string[]>();
  for (const line of log.split("\n")) {
    const match = /^(feat|fix|perf|docs|refactor|build|test|chore)(?:\([^)]*\))?!?:\s*(.+)$/.exec(line);
    const group = match?.[1] === "feat" ? "Features" : match?.[1] === "fix" || match?.[1] === "perf" ? "Fixes and performance" : "Other changes";
    const entries = groups.get(group) ?? [];
    entries.push(`- ${match?.[2] ?? line}`);
    groups.set(group, entries);
  }
  return [...groups.entries()].map(([heading, entries]) => `## ${heading}\n${entries.join("\n")}`).join("\n\n");
}

async function main(): Promise<void> {
  const flags = options();
  const packageJson = await Bun.file(`${root}/package.json`).json() as { version?: string };
  const version = packageJson.version;
  if (version === undefined || !/^\d+\.\d+\.\d+/.test(version)) throw new Error("package.json must contain a semver version");

  const previousTag = (() => {
    try { return run("git", ["describe", "--tags", "--abbrev=0"]); } catch { return undefined; }
  })();
  const tag = flags.tag ?? `v${version}`;
  const notes = releaseNotes(previousTag);

  console.log(`${flags.dryRun ? "Dry run" : "Release"}: ${tag}`);
  console.log(`Previous tag: ${previousTag ?? "none"}`);
  console.log(notes);

  if (flags.publish) {
    run("gh", ["release", "create", tag, "--title", `Subpolar ${tag}`, "--notes", notes]);
    console.log(`Published ${tag}`);
  }
}

await main();
