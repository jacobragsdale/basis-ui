/* The headers fixture mode puts on each answer it gives under `/api`, naming what answered: `vp run shot` reads them
 * into its network file. No API sets them, so a response without them came from a live API. */

/** What answered a request in fixture mode: a record in `.fixtures/`, a fixture in `fixtures/`, orval's generated
 * handlers, or nothing, with the problem that says what to add. */
type AnswerSource = "fixture" | "generated" | "none" | "record";

/** The header naming the source, as `fixture`. */
const sourceHeader = "x-basis-fixture-source";

/** The header naming the file that answered, from the app's root, as `fixtures/conventions.json`, for a record or a
 * fixture. */
const fileHeader = "x-basis-fixture-file";

/** Where fixture mode serves the files that fixtures' `body_file` names, from the page's base: the file
 * `fixtures/data/trades.arrows` at `__basis/fixture-body/fixtures/data/trades.arrows`, which `vp dev` serves from
 * disk and a build in fixture mode (`vp build --mode fixtures`) copies there. */
const bodyFilesPath = "__basis/fixture-body/";

export { bodyFilesPath, fileHeader, sourceHeader };
export type { AnswerSource };
