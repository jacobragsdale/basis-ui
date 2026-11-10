/* The pages `checkRoutes` opens: one for each path of the app's router, as `vp run shot --all` lists them. A path
 * with a parameter, such as `/bonds/$security`, is opened at the sample `checkRoutes`' `params` give it, or else at a
 * fixture of a `GET` answered with a 2xx, in the order fixture mode tries them:
 *
 * 1. the first whose path the route's matches, as `/bonds/US91282CRF04` matches it, a fixture whose path the route's
 *    is all of before one whose path it begins;
 * 2. else the first whose operation, by the app's `openapi.json`, takes a path parameter of each name the route's
 *    does, as `vp run new` names a route's parameters, so `/bond-terms/$security` opens at the `security` of a fixture
 *    of `GET /bonds/{security}`.
 *
 * A path no sample is found for is skipped, with a line that says how to give one. */

import type { LoadedFixture } from "#fixtures/record.ts";

/** Each route's sample, by its path as the router writes it, such as
 * `{ "/bonds/$security": { security: "US91282CRF04" } }`. A splat, `$`, takes its value as `_splat`. */
type RouteParams = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** What a route's sample can come from: the fixtures, and the values each one's path gives its operation's path
 * parameters, by its file. */
interface SampleSources {
  readonly fixtures: readonly LoadedFixture[];
  readonly parameters?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** A route with the page that stands for it, and where that page came from, when the route needed a sample. */
interface RouteSample {
  readonly route: string;
  readonly path: string;
  /** `checkRoutes' params`, or the fixture's file the sample came from. */
  readonly from?: string;
}

/** A route that is not opened, with the line that says so. */
interface RouteSkip {
  readonly route: string;
  readonly line: string;
}

/** A route whose given sample cannot be used, with the line that says why. */
interface RouteProblem {
  readonly route: string;
  readonly problem: string;
}

type RoutePlan = RouteProblem | RouteSample | RouteSkip;

/** A parameter's segment, `$security`, and a splat's, `$`. */
const parameter = /^\$(?<name>[A-Za-z_]\w*)$/u;
const splat = "$";
const splatName = "_splat";

/** The router's paths, each once, without a trailing slash. */
function routePaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.map((path) => (path.length > 1 ? path.replace(/\/$/u, "") : path)))];
}

/** What a route segment is: a word to match, a parameter by its name, or the splat. */
type Segment =
  | { readonly kind: "literal"; readonly text: string }
  | { readonly kind: "parameter"; readonly name: string }
  | { readonly kind: "splat" };

function segmentsOf(route: string): readonly Segment[] {
  return route
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment): Segment => {
      if (segment === splat) {
        return { kind: "splat" };
      }
      const name = parameter.exec(segment)?.groups?.["name"];
      return name === undefined ? { kind: "literal", text: segment } : { kind: "parameter", name };
    });
}

/** Whether a route has a segment it cannot be opened at as it stands. */
function takesParameters(route: string): boolean {
  return route.includes("$");
}

/** A segment's part of the page `route` stands for with `values`, encoded as a path holds it, or `undefined` when
 * `values` lacks its parameter or it is a pattern this reads no value for. */
function filledSegment(
  segment: Segment,
  values: Readonly<Record<string, string>>,
): string | undefined {
  if (segment.kind === "literal") {
    return segment.text.includes("$") ? undefined : segment.text;
  }
  if (segment.kind === "splat") {
    return values[splatName]
      ?.split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }
  const value = values[segment.name];
  return value === undefined ? undefined : encodeURIComponent(value);
}

/** The page `route` stands for with `values`, or `undefined` when they lack one of its parameters. */
function filled(route: string, values: Readonly<Record<string, string>>): string | undefined {
  const parts = segmentsOf(route).map((segment) => filledSegment(segment, values));
  return parts.includes(undefined) ? undefined : `/${parts.join("/")}`;
}

/** A segment of a fixture's path, as the route's parameter takes it. */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The values `route` takes from a fixture's path, split into `parts`, and whether the route is all of the path, or
 * `undefined` when the path does not begin with the route. */
function valuesFromParts(
  route: readonly Segment[],
  parts: readonly string[],
): { readonly values: Readonly<Record<string, string>>; readonly whole: boolean } | undefined {
  const values: Record<string, string> = {};
  for (const [index, segment] of route.entries()) {
    const part = parts[index];
    if (part === undefined || (segment.kind === "literal" && segment.text !== part)) {
      return undefined;
    }
    // A splat, which only the last segment is, takes the rest of the path.
    if (segment.kind !== "literal") {
      values[segment.kind === "splat" ? splatName : segment.name] =
        segment.kind === "splat"
          ? parts
              .slice(index)
              .map((rest) => decoded(rest))
              .join("/")
          : decoded(part);
    }
  }
  const splatted = route.at(-1)?.kind === "splat";
  return { values, whole: splatted || parts.length === route.length };
}

/** The values `route` takes from a fixture's `path`, as `valuesFromParts` says. */
function valuesFrom(
  route: readonly Segment[],
  path: string,
): { readonly values: Readonly<Record<string, string>>; readonly whole: boolean } | undefined {
  const parts = new URL(path, "http://route.invalid").pathname.split("/").filter(Boolean);
  return valuesFromParts(route, parts);
}

const ok = 200;
const lastOk = 299;

/** Whether a fixture answers a page's `GET` with success. */
function answersAPage({ record }: LoadedFixture): boolean {
  const { status } = record.response;
  return record.request.method === "GET" && status >= ok && status <= lastOk;
}

/** The sample the fixture `answering` gives `route` by its operation's path parameters, if they name each of the
 * route's. */
function byName(
  route: string,
  answering: readonly LoadedFixture[],
  parameters: Readonly<Record<string, Readonly<Record<string, string>>>>,
): { readonly path: string; readonly file: string } | undefined {
  if (segmentsOf(route).some(({ kind }) => kind === "splat")) {
    return undefined;
  }
  for (const { file } of answering) {
    const path = filled(route, parameters[file] ?? {});
    if (path !== undefined) {
      return { file, path };
    }
  }
  return undefined;
}

/** The sample a fixture gives `route`: one whose path the route is all of, else one whose path it begins, else one
 * whose operation's path parameters name the route's. */
function fromFixtures(
  route: string,
  { fixtures, parameters = {} }: SampleSources,
): { readonly path: string; readonly file: string } | undefined {
  const segments = segmentsOf(route);
  const answering = fixtures.filter((fixture) => answersAPage(fixture));
  const found = answering.flatMap((fixture) => {
    const matched = valuesFrom(segments, fixture.record.request.path);
    const path = matched === undefined ? undefined : filled(route, matched.values);
    return matched === undefined || path === undefined
      ? []
      : [{ file: fixture.file, path, whole: matched.whole }];
  });
  return found.find(({ whole }) => whole) ?? found[0] ?? byName(route, answering, parameters);
}

/** Each parameter's name in `route`, as `params` takes it. */
function parameterNames(route: string): readonly string[] {
  return segmentsOf(route).flatMap((segment) => {
    if (segment.kind === "literal") {
      return [];
    }
    return [segment.kind === "splat" ? splatName : segment.name];
  });
}

/** The line a route skipped for want of a sample reads as. */
function skippedLine(route: string): string {
  const names = parameterNames(route);
  const values = names.map((name) => `${name}: "VALUE"`).join(", ");
  const example =
    names.length === 0
      ? ""
      : `, as checkRoutes(routeTree, { params: { ${JSON.stringify(route)}: { ${values} } } })`;
  return `skipped ${route}, which takes a parameter no fixture in fixtures/ gives: add a fixture of a GET its page makes, or name a sample in checkRoutes' params${example}.`;
}

/** The plan for a route with a parameter: at the sample `given` names, or a line saying it names none it can open. */
function givenPlan(route: string, given: Readonly<Record<string, string>>): RoutePlan {
  const path = filled(route, given);
  if (path === undefined) {
    const names = parameterNames(route).map((name) => JSON.stringify(name));
    return {
      problem: `ERROR ${route}: checkRoutes' params give it no sample it can be opened at: give a value for each of its parameters, ${names.join(", ")}.`,
      route,
    };
  }
  return { from: "checkRoutes' params", path, route };
}

/** The page each of the router's `paths` is opened at, or why it is not. */
function routeSamples(
  paths: readonly string[],
  sources: SampleSources,
  params: RouteParams = {},
): readonly RoutePlan[] {
  return routePaths(paths).map((route): RoutePlan => {
    if (!takesParameters(route)) {
      return { path: route, route };
    }
    const given = params[route];
    if (given !== undefined) {
      return givenPlan(route, given);
    }
    const sample = fromFixtures(route, sources);
    return sample === undefined
      ? { line: skippedLine(route), route }
      : { from: sample.file, path: sample.path, route };
  });
}

export { routePaths, routeSamples, skippedLine };
export type { RouteParams, RoutePlan, RouteProblem, RouteSample, RouteSkip, SampleSources };
