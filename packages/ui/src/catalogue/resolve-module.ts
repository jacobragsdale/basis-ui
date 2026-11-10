/* The file a module specifier names, for the component catalogue: a file of this repo's packages, by a relative path,
 * a `#` import or `@basis/ui`'s own name, or the declaration file of a library the catalogue opens, which is Base UI. */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { parseFile, uiPackage } from "./ast.ts";
import type { ParsedFile } from "./ast.ts";

/** Libraries whose declarations the catalogue opens; every other bare specifier is left as written. */
const followedLibraries = ["@base-ui/"];

/** The declaration file beside a library's built module, which Base UI ships for each. */
function declarationFile(url: URL): URL | undefined {
  const candidates = [
    url.href.replace(/\.(?:m?js)$/u, ".d.ts"),
    `${url.href}.d.ts`,
    `${url.href}/index.d.ts`,
    url.href,
  ];
  const found = candidates.find(
    (candidate) => /\.tsx?$/u.test(candidate) && existsSync(new URL(candidate)),
  );
  return found === undefined ? undefined : new URL(found);
}

/** The file of `@basis/ui` or one of its subpaths, read from its source, as parallax's code imports it. */
function uiModule(specifier: string): URL | undefined {
  const subpath = specifier.slice(uiPackage.name.length);
  const url = new URL(subpath === "" ? "src/index.ts" : `src${subpath}/index.ts`, uiPackage.root);
  return existsSync(url) ? url : undefined;
}

function libraryModule(file: ParsedFile, specifier: string): URL | undefined {
  if (!followedLibraries.some((library) => specifier.startsWith(library))) {
    return undefined;
  }
  try {
    return declarationFile(pathToFileURL(createRequire(file.url).resolve(specifier)));
  } catch {
    return undefined;
  }
}

/** The file a module specifier in `file` names, or `undefined` for a library the catalogue does not open. */
function resolveModule(file: ParsedFile, specifier: string): URL | undefined {
  if (specifier.startsWith("#")) {
    return file.pkg === undefined || specifier.startsWith("#wasm/")
      ? undefined
      : new URL(`src/${specifier.slice(1)}`, file.pkg.root);
  }
  if (specifier.startsWith(".")) {
    return declarationFile(new URL(specifier, file.url));
  }
  if (specifier === uiPackage.name || specifier.startsWith(`${uiPackage.name}/`)) {
    return uiModule(specifier);
  }
  return libraryModule(file, specifier);
}

function moduleFile(file: ParsedFile, specifier: string): ParsedFile | undefined {
  const url = resolveModule(file, specifier);
  return url === undefined ? undefined : parseFile(url);
}

export { moduleFile, resolveModule };
