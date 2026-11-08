/* The component catalogue (src/catalogue/build.ts) is what agents that never read this package's code learn it from, so
 * it must be current, every component must say what it is for, and each family's example must compile in an app. */

import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { buildCatalogue, catalogueText } from "#catalogue/build.ts";
import type { Catalogue } from "#catalogue/build.ts";
import { exampleErrors } from "#catalogue/examples.ts";

const catalogue = buildCatalogue();

describe("the component catalogue", () => {
  test("catalogue.json is what the source holds now", () => {
    const written = readFileSync(new URL("../catalogue.json", import.meta.url), "utf8");
    expect(written, "catalogue.json is stale: run vp run @basis/ui#catalogue").toBe(
      catalogueText(),
    );
  });

  test("every component says what it is for", () => {
    const silent = catalogue.components.filter((component) => component.purpose === "");
    expect(
      silent.map((component) => component.name),
      "give each a doc comment saying what it is for",
    ).toStrictEqual([]);
  });

  test("every family has an example", () => {
    const families = Map.groupBy(catalogue.components, (component) => component.family);
    const without = [...families].flatMap(([family, members]) =>
      members.some((member) => member.example !== undefined) ? [] : [family],
    );
    expect(without, "add an @example to the family's main component").toStrictEqual([]);
  });

  test("lists the components an app builds with, with their props and variants", () => {
    const button = catalogue.components.find((component) => component.name === "Button");
    expect(button?.variants["variant"]?.options).toContain("outline");
    expect(button?.extends).toStrictEqual(["ButtonPrimitive.Props"]);
    const dataTable = catalogue.components.find((component) => component.name === "DataTable");
    expect(dataTable?.props.find((prop) => prop.name === "rowCap")?.optional).toBe(true);
    expect(catalogue.icons.length).toBeGreaterThan(0);
  });

  test("every example compiles in an app configured as the README says", () => {
    expect(exampleErrors(catalogue)).toBe("");
  });

  test("an example that does not compile is caught", () => {
    const broken: Catalogue = {
      ...catalogue,
      components: [
        {
          example: 'import { Button } from "@basis/ui";\n\n<Button variant="huge">Go</Button>;\n',
          extends: [],
          family: "broken",
          name: "Broken",
          props: [],
          purpose: "A broken example.",
          variants: {},
        },
      ],
    };
    expect(exampleErrors(broken)).toContain("broken.tsx");
  });
});
