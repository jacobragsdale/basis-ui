/* What `vp run new` makes a page from: the operation, the names orval gives its function, hook, handler and models,
 * the route's path and the values its parameters take in the fixture, the test and the shot. */

import type { ApiOperation, Schema } from "./api-operations.ts";
import type { NewFixture } from "./fixture-new.ts";
import type { Fields } from "./scaffold-fields.ts";

type ScaffoldKind = "form" | "page" | "table";

interface PathParameter {
  /** The parameter's name in the API's path, as `security`. */
  readonly name: string;
  /** The name orval gives its argument, and the route's parameter, as `bookId` for `book_id`. */
  readonly variable: string;
  /** The value the fixture and the test give it. */
  readonly value: string;
}

interface Scaffold {
  readonly kind: ScaffoldKind;
  /** The page's name, in kebab case, as `trade-blotter`, which names its files. */
  readonly name: string;
  /** The page's title, as `Trade blotter`. */
  readonly title: string;
  /** The page's component, as `TradeBlotterPage`. */
  readonly component: string;
  /** The route's path, as `/trade-blotter/$book`. */
  readonly routePath: string;
  /** The route's path with each parameter's value, as `/trade-blotter/RATES`, which the test and the shot open. */
  readonly openPath: string;
  readonly parameters: readonly PathParameter[];
  readonly operation: ApiOperation;
  readonly document: Schema;
  /** The generated request function, hook and MSW handler, as `conventions`, `useConventions` and
   * `getConventionsMockHandler`. */
  readonly client: { readonly call: string; readonly hook: string; readonly handler: string };
  /** The type of a row, of the detail or of the form's body: the model's name, or a type derived from the call. */
  readonly model: { readonly name: string; readonly derived: boolean };
  readonly fields: Fields;
  readonly fixture: NewFixture;
}

/** The files a scaffold writes, by their names from the app's root. */
function filesOf(scaffold: Pick<Scaffold, "name">): {
  readonly page: string;
  readonly test: string;
  readonly fixture: string;
} {
  return {
    fixture: `fixtures/${scaffold.name}.json`,
    page: `src/pages/${scaffold.name}.tsx`,
    test: `src/pages/${scaffold.name}.test.ts`,
  };
}

/** The opening comment of a file a scaffold writes, wrapped to the line. */
function opening(text: string): string {
  const width = 116;
  const lines = [""];
  for (const word of text.split(/\s+/u)) {
    const line = lines.at(-1) ?? "";
    if (line !== "" && line.length + word.length + 1 > width) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = line === "" ? word : `${line} ${word}`;
    }
  }
  return `/* ${lines.join("\n * ")} */`;
}

/** What the page's comment says of the fields it left out. */
function skippedNote({ fields }: Pick<Scaffold, "fields">): string {
  const { skipped } = fields;
  if (skipped.length === 0) {
    return "";
  }
  return ` It leaves out ${skipped.join(", ")}, which ${skipped.length === 1 ? "holds" : "hold"} an object or a list: lay ${skipped.length === 1 ? "it" : "them"} out by hand.`;
}

export { filesOf, opening, skippedNote };
export type { PathParameter, Scaffold, ScaffoldKind };
