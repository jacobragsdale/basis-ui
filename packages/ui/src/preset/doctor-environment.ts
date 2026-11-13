/* What `vp run doctor` checks of the desktop around the app (doctor.ts): the Node that runs its tasks, against the
 * versions Vite+ and @basis/ui name; the certificate file `NODE_EXTRA_CA_CERTS` names; and one HTTPS request to the
 * registry the app installs from, made as pnpm makes it, through `HTTPS_PROXY` when one is set, so a proxy that
 * inspects TLS with a certificate Node does not trust is named before `vp install` fails on it. */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { ignored, installedVersion } from "./installed.ts";

/** One check's outcome: a line saying what it found, or an ERROR line ending with the fix. */
interface Finding {
  readonly ok: boolean;
  readonly line: string;
}

function passed(line: string): Finding {
  return { line, ok: true };
}

function failed(line: string): Finding {
  return { line: `ERROR ${line}`, ok: false };
}

/** A version's three numbers. */
function numbers(version: string): readonly number[] {
  return version.replace(/^v/u, "").split("-")[0]?.split(".").map(Number) ?? [0, 0, 0];
}

/** How two versions compare by their numbers: below zero when `left` is older. */
function compare(left: readonly number[], right: readonly number[]): number {
  const index = [0, 1, 2].find((at) => (left[at] ?? 0) !== (right[at] ?? 0));
  return index === undefined ? 0 : (left[index] ?? 0) - (right[index] ?? 0);
}

/** Whether `version`, at least `wanted`, stays within the part of it that `operator` holds fixed: the major for `^`,
 * the major and minor for `~`, all of it for a bare version, and none for `>=`. */
const within: Readonly<
  Record<string, (version: readonly number[], wanted: readonly number[]) => boolean>
> = {
  "": (version, wanted) => compare(version, wanted) === 0,
  ">=": () => true,
  "^": (version, wanted) => version[0] === wanted[0],
  "~": (version, wanted) => version[0] === wanted[0] && version[1] === wanted[1],
};

/** Whether `version` meets one comparator of an `engines` range: `^22.18.0`, `>=26.0.0`, or a bare version. One it
 * cannot read is met, so the check never refuses a Node on a range it does not understand. */
function meets(version: readonly number[], comparator: string): boolean {
  const match = /^(?<operator>\^|>=|~)?\s*v?(?<wanted>\d+(?:\.\d+){0,2})$/u.exec(comparator.trim());
  if (match?.groups === undefined) {
    return true;
  }
  const wanted = numbers(match.groups["wanted"] ?? "0");
  const held = within[match.groups["operator"] ?? ""];
  return compare(version, wanted) >= 0 && (held?.(version, wanted) ?? true);
}

/** Whether `version` meets an `engines` range: one of its `||` alternatives, each of comparators all met. */
function satisfies(version: string, range: string): boolean {
  return range.split("||").some((alternative) =>
    alternative
      .trim()
      .split(/\s+/u)
      .every((comparator) => meets(numbers(version), comparator)),
  );
}

const enginesSchema = z.object({ engines: z.object({ node: z.string() }).optional() });

/** The range of Node a package installed in the app names in its `engines`, if it names one. */
async function nodeRange(root: string, name: string): Promise<string | undefined> {
  const version = await installedVersion(root, name);
  if (version === undefined) {
    return undefined;
  }
  const manifest = await readFile(
    path.join(root, "node_modules", name, "package.json"),
    "utf8",
  ).catch(ignored);
  const parsed = enginesSchema.safeParse(JSON.parse(manifest ?? "{}"));
  return parsed.success ? parsed.data.engines?.node : undefined;
}

/** Whether the Node that runs the app's tasks is one Vite+ and @basis/ui support. Vite+ prefers a Node on the PATH to
 * its own, so an older one there, as Ubuntu's 18, runs the tasks until `vp env on`. */
async function nodeFindings(root: string): Promise<readonly Finding[]> {
  const version = process.versions.node;
  const ranges = await Promise.all(
    ["vite-plus", "@basis/ui"].map(async (name) => ({ name, range: await nodeRange(root, name) })),
  );
  const unmet = ranges.find(({ range }) => range !== undefined && !satisfies(version, range));
  return unmet === undefined
    ? [passed(`Node ${version}`)]
    : [
        failed(
          `Node ${version} runs vp's tasks, and ${unmet.name} needs Node ${unmet.range ?? ""}: run vp env on, so Vite+ runs its own Node rather than an older one on the PATH, then open a new terminal and run vp run doctor again.`,
        ),
      ];
}

/** How the one request to the registry came out, as the probe prints it. */
const probeSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  status: z.number().optional(),
});

/** The probe: Node, in a process of its own with the proxy variables honoured, asks the URL for its headers. */
const probe = `
const url = process.argv[1];
fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) })
  .then((response) => process.stdout.write(JSON.stringify({ status: response.status })))
  .catch((error) => {
    const cause = error.cause ?? error;
    process.stdout.write(JSON.stringify({ code: String(cause.code ?? cause.name ?? ""), message: String(cause.message ?? error) }));
  });
`;

/** The codes Node gives a certificate it does not trust, as a proxy that inspects TLS presents. */
const untrusted = new Set([
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

/** The registry the app installs from: `.npmrc`'s `registry`, or npm's, which pnpm uses when it names none. */
async function registryOf(root: string): Promise<{ readonly url: string; readonly from: string }> {
  const npmrc = await readFile(path.join(root, ".npmrc"), "utf8").catch(ignored);
  const named = /^\s*registry\s*=\s*(?<url>\S+)\s*$/mu.exec(npmrc ?? "")?.groups?.["url"];
  return named === undefined
    ? { from: "pnpm's default, since .npmrc names none", url: "https://registry.npmjs.org/" }
    : { from: ".npmrc's", url: named };
}

/** The fix for a certificate Node does not trust: the variable that names the proxy's root certificate. */
function trustFix(): string {
  const named = process.env["NODE_EXTRA_CA_CERTS"];
  const set =
    process.platform === "win32"
      ? String.raw`setx NODE_EXTRA_CA_CERTS C:\path\to\root-ca.crt`
      : "export NODE_EXTRA_CA_CERTS=/path/to/root-ca.crt in ~/.profile";
  return named === undefined || named === ""
    ? `set NODE_EXTRA_CA_CERTS to the proxy's root certificate, a .crt or .pem file, for good with ${set}, then open a new terminal and run vp run doctor again`
    : `NODE_EXTRA_CA_CERTS names ${named}, which does not hold the certificate that signed it: set it to the proxy's root certificate, then open a new terminal and run vp run doctor again`;
}

/** One HTTPS request to the registry, as pnpm would make it: answered, refused for its certificate, or unanswered. */
async function registryFinding(root: string): Promise<Finding> {
  const { from, url } = await registryOf(root);
  const ran = spawnSync(process.execPath, ["-e", probe, url], {
    encoding: "utf8",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
    timeout: 20_000,
    windowsHide: true,
  });
  const parsed = probeSchema.safeParse(JSON.parse(ran.stdout === "" ? "{}" : ran.stdout));
  const said = parsed.success ? parsed.data : {};
  if (said.status !== undefined) {
    return passed(`the registry at ${url}, ${from}, answers`);
  }
  const code = said.code ?? "no answer";
  return untrusted.has(code)
    ? failed(
        `Node does not trust the certificate the registry at ${url} answers with (${code}), as behind a proxy that inspects TLS, so vp install and every Node tool fail: ${trustFix()}.`,
      )
    : failed(
        `the registry at ${url}, ${from}, did not answer (${code}${said.message === undefined ? "" : `: ${said.message}`}): check the network, and HTTPS_PROXY when a proxy stands between, then run vp run doctor again.`,
      );
}

/** The certificate file `NODE_EXTRA_CA_CERTS` names, when it names one: Node ignores a file that is not there. */
function certificatesFinding(): readonly Finding[] {
  const named = process.env["NODE_EXTRA_CA_CERTS"];
  if (named === undefined || named === "") {
    return [];
  }
  return existsSync(named)
    ? [passed(`NODE_EXTRA_CA_CERTS names ${named}`)]
    : [
        failed(
          `NODE_EXTRA_CA_CERTS names ${named}, which does not exist, so Node trusts no certificate beyond its own: set it to the proxy's root certificate file, then open a new terminal and run vp run doctor again.`,
        ),
      ];
}

/** The desktop's findings around the app: Node, the certificates, and the registry. */
async function environmentFindings(root: string): Promise<readonly Finding[]> {
  return [...(await nodeFindings(root)), ...certificatesFinding(), await registryFinding(root)];
}

export { environmentFindings, failed, passed, satisfies };
export type { Finding };
