/* The scanner every reader of suppressions shares (src/preset/suppressions.ts): the lint rule's, which reads each
 * comment the parser gives it, and verify's, which reads each file of src/ and so is the backstop for a comment that
 * turns every rule off. A directive on a later line of a block comment is one TypeScript honours, and a `//` or `/*`
 * inside a string or a URL starts no comment. */

import { describe, expect, test } from "vite-plus/test";

import { suppressionIn, suppressionsInText } from "#preset/suppressions.ts";

describe("suppressionIn", () => {
  test("finds a type directive on a block comment's later line, where TypeScript reads it", () => {
    expect(suppressionIn(" the API sends a string here\n * @ts-expect-error ")).toStrictEqual({
      directive: "@ts-expect-error",
      rules: [],
    });
    expect(suppressionIn("*\n * Why the value is a string.\n * @ts-ignore\n ")).toStrictEqual({
      directive: "@ts-ignore",
      rules: [],
    });
  });

  test("passes a comment that only names a directive within a sentence", () => {
    expect(suppressionIn(" this page writes no @ts-ignore, as AGENTS.md says")).toBeUndefined();
    expect(suppressionIn(" the eslint-disable comment was removed")).toBeUndefined();
  });
});

describe("suppressionsInText", () => {
  const everyRule =
    "ERROR eslint-disable-line turns off every rule, and an app turns off no rule but oxc/no-barrel-file in src/api: remove the comment and fix what the rule reports, as its ERROR line says.";

  test("finds a directive after a string that holds a URL", async () => {
    const found = await suppressionsInText(
      "src/help.tsx",
      'const help = "https://wiki.example/help"; // eslint-disable-line\nexport const link = <a href="https://wiki.example/help">Help</a>; // eslint-disable-line\n',
    );
    expect(found).toStrictEqual([
      { directive: "eslint-disable-line", file: "src/help.tsx", line: 1, refusal: everyRule },
      { directive: "eslint-disable-line", file: "src/help.tsx", line: 2, refusal: everyRule },
    ]);
  });

  test("finds a block comment after a string that holds /*", async () => {
    const found = await suppressionsInText(
      "src/upload.tsx",
      'export const files = "src/*";\nexport const input = <input type="file" accept="image/*" />;\n/* eslint-disable */\n',
    );
    expect(found.map(({ directive, line }) => [directive, line])).toStrictEqual([
      ["eslint-disable", 3],
    ]);
  });

  test("finds a type directive on a block comment's last line, and counts lines past text that is not ASCII", async () => {
    const found = await suppressionsInText(
      "src/trade.ts",
      '// Prix en €, taux en ‰.\n/* the API sends a string here\n * @ts-expect-error */\nexport const hidden: number = "1";\n',
    );
    expect(found.map(({ directive, line }) => [directive, line])).toStrictEqual([
      ["@ts-expect-error", 2],
    ]);
  });

  test("counts no directive quoted in a string, which is no comment", async () => {
    expect(
      await suppressionsInText("src/words.ts", 'export const words = "// eslint-disable all";\n'),
    ).toStrictEqual([]);
  });

  test("still finds a directive in a file the parser cannot read", async () => {
    const found = await suppressionsInText(
      "src/broken.tsx",
      "export const page = <div>{ oops </div>;\n/* eslint-disable */\n",
    );
    expect(found.map(({ directive, line }) => [directive, line])).toStrictEqual([
      ["eslint-disable", 2],
    ]);
  });
});
