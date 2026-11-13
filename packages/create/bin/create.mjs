#!/usr/bin/env node
/* `@basis/create`'s creator, which makes a UI repo from the template beside it:
 *
 *   vp dlx @basis/create NAME
 *
 * It copies templates/app into the folder NAME, renames _gitignore to .gitignore, which a packed package cannot hold,
 * names the package and the page's title after the folder, runs git init, and prints the commands that come next. It
 * is plain Node with no dependency, since it runs before anything is installed, and it is the template's creator
 * rather than `vp create`, which rewrites every app it makes into a configuration the app's own drift check refuses
 * (docs/design.md, A UI repo). Every failure is one line that starts with ERROR and ends with the fix. */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const template = fileURLToPath(new URL("../templates/app", import.meta.url));
/** What a packed package cannot hold, which the template keeps under another name. */
const renamed = { _gitignore: ".gitignore", _npmrc: ".npmrc" };
/** A name npm takes for a package, and a folder takes on every system: lowercase, digits, dots, dashes, underscores. */
const packageName = /^[a-z0-9][a-z0-9._-]*$/u;
const usage = "run vp dlx @basis/create NAME, such as vp dlx @basis/create positions-ui";

/** A failure: its one ERROR line, which the creator prints before it exits 1. */
class CreateError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "CreateError";
  }
}

/**
 * The one folder the arguments name, or the failure that says how to name it.
 * @param {readonly string[]} args
 * @returns {string}
 */
function nameOf(args) {
  const named = args.filter((arg) => !arg.startsWith("-"));
  const [name, ...extra] = named;
  if (name === undefined || extra.length > 0 || named.length < args.length) {
    throw new CreateError(`ERROR @basis/create takes the new app's folder alone: ${usage}.`);
  }
  return name;
}

/**
 * The folder to make, from the arguments, or the failure that says how to name it.
 * @param {readonly string[]} args
 * @returns {{ readonly name: string, readonly target: string }}
 */
function targetOf(args) {
  const target = path.resolve(nameOf(args));
  const base = path.basename(target);
  if (!packageName.test(base)) {
    throw new CreateError(
      `ERROR ${base} cannot name the app's package, which takes lowercase letters, digits, dots, dashes and underscores: ${usage}.`,
    );
  }
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new CreateError(
      `ERROR ${target} exists and is not empty, and @basis/create makes a new app: name a new folder, or empty this one, then run it again.`,
    );
  }
  return { name: base, target };
}

/**
 * The template copied into `target`, its kept names restored, its package and page named `name`.
 * @param {string} target
 * @param {string} name
 */
function copyTemplate(target, name) {
  cpSync(template, target, { recursive: true });
  for (const [from, to] of Object.entries(renamed)) {
    if (existsSync(path.join(target, from))) {
      renameSync(path.join(target, from), path.join(target, to));
    }
  }
  const manifest = path.join(target, "package.json");
  writeFileSync(
    manifest,
    readFileSync(manifest, "utf8").replace(/"name": "[^"]*"/u, `"name": "${name}"`),
  );
  const page = path.join(target, "index.html");
  writeFileSync(
    page,
    readFileSync(page, "utf8").replace(/<title>[^<]*<\/title>/u, `<title>${name}</title>`),
  );
}

/**
 * A git repository in `target`, before the install, so that its `prepare` installs the app's hooks.
 * @param {string} target
 */
function gitInit(target) {
  const ran = spawnSync("git", ["init", "--quiet", "--initial-branch=main"], {
    cwd: target,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  if (ran.status !== 0) {
    const said = ran.error?.message ?? String(ran.stderr).trim().split("\n")[0];
    throw new CreateError(
      `ERROR the app is made at ${target}, but git init failed (${said}), so no hook will run: install Git, Git for Windows on a Windows desktop, then run git init in ${target} before vp install.`,
    );
  }
}

function main() {
  try {
    const { name, target } = targetOf(process.argv.slice(2));
    copyTemplate(target, name);
    gitInit(target);
    const folder = path.relative(process.cwd(), target) || ".";
    process.stdout.write(
      [
        `Made ${name} at ${target}, a git repository with nothing committed yet. Next:`,
        "",
        `  cd ${folder}`,
        "  vp install",
        "  vp run doctor",
        "  vp dev",
        "",
        "Then commit it, which runs the app's checks, and read its AGENTS.md for how to replace the sample API.",
        "",
      ].join("\n"),
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof CreateError ? error.message : `ERROR @basis/create failed: ${String(error)}; run it again, and report the message if it repeats.`}\n`,
    );
    process.exitCode = 1;
  }
}

main();
