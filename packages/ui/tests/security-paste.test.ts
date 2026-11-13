/* A list of identifiers pasted into a SecurityPicker that chooses several: read, checked, looked up, and summed up. */

import { describe, expect, test } from "vite-plus/test";

import {
  identifiersIn,
  lookUpPasted,
  pasteLimit,
  pasteSearches,
  pasteSummary,
} from "#components/security-paste.ts";
import { securityIdentifierKinds } from "#securities/security-identifier.ts";
import { sleep } from "#utils/index.ts";
import type { SecurityIdentifier } from "#securities/security-identifier.ts";

interface Security {
  readonly cusip: string;
  readonly name: string;
}

const known: Readonly<Record<string, Security>> = {
  "3137EAEP0": { cusip: "3137EAEP0", name: "FHLMC 1.5% 2025" },
  "912828XG0": { cusip: "912828XG0", name: "UST 2.125% 2024" },
};

/** A search that finds a known CUSIP, or nothing. */
async function search(identifier: SecurityIdentifier): Promise<readonly Security[]> {
  const security = known[identifier.value];
  return Promise.resolve(security === undefined ? [] : [security]);
}

const lookup = {
  itemKey: (security: Security): string => security.cusip,
  kinds: securityIdentifierKinds,
  search,
  signal: new AbortController().signal,
};

describe(identifiersIn, () => {
  test("splits pasted text at spaces, new lines, commas, semicolons and tabs", () => {
    expect(identifiersIn("912828XG0\n3137EAEP0, 912828XG0;\tUS9128285M81 ")).toStrictEqual([
      "912828XG0",
      "3137EAEP0",
      "912828XG0",
      "US9128285M81",
    ]);
  });
});

describe(lookUpPasted, () => {
  test("adds each security found once, in the order pasted, and says why the rest added none", async () => {
    const result = await lookUpPasted({
      ...lookup,
      words: ["3137EAEP0", "91282CRF1", "912828XG0", "3137EAEP0", "037833100"],
    });
    expect(result.found.map((security) => security.cusip)).toStrictEqual([
      "3137EAEP0",
      "912828XG0",
    ]);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toMatch(/^"91282CRF1" is not a CUSIP/u);
    expect(result.problems[1]).toBe("037833100 matched no security.");
  });

  test("looks up at most the limit, and says so", async () => {
    const words = Array.from({ length: pasteLimit + 1 }, () => "912828XG0");
    const result = await lookUpPasted({ ...lookup, words });
    expect(result.found).toHaveLength(1);
    expect(result.problems).toStrictEqual([`Only the first ${String(pasteLimit)} were looked up.`]);
  });
});

describe(pasteSummary, () => {
  test("says how many were added, then each problem", () => {
    expect(pasteSummary(1, { problems: [] })).toBe("Added 1 security.");
    expect(pasteSummary(2, { problems: ["037833100 matched no security."] })).toBe(
      "Added 2 securities. 037833100 matched no security.",
    );
  });
});

test("a long paste runs at most six searches at once, and keeps the order pasted", async () => {
  let running = 0;
  let most = 0;
  const words = Array.from({ length: 20 }, (_unused, index) =>
    index % 2 === 0 ? "912828XG0" : "3137EAEP0",
  );
  const counted = async (identifier: SecurityIdentifier): Promise<readonly Security[]> => {
    running += 1;
    most = Math.max(most, running);
    await sleep(1);
    running -= 1;
    return search(identifier);
  };
  const result = await lookUpPasted({ ...lookup, search: counted, words });
  expect([most, pasteSearches, result.found.map(({ cusip }) => cusip)]).toStrictEqual([
    6,
    6,
    ["912828XG0", "3137EAEP0"],
  ]);
});
