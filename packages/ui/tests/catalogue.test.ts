/* The component catalogue (src/catalogue/build.ts) is what agents that never read this package's code learn it from, so
 * it must be current, every entry must say what it is for, each family's example must compile in an app, each prop it
 * lists must be one the component takes, and every type an entry names must be defined beside it. */

import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { buildCatalogue, catalogueText } from "#catalogue/build.ts";
import type { Catalogue, CatalogueComponent } from "#catalogue/build.ts";
import { exampleErrors } from "#catalogue/examples.ts";

const catalogue = buildCatalogue();

function component(name: string): CatalogueComponent | undefined {
  return catalogue.components.find((entry) => entry.name === name);
}

/** Families whose example waits, with the reason: none may wait without one. */
const examplesWaiting: Readonly<Record<string, string>> = {
  "@basis/parallax grid":
    "grid.tsx is at max-lines' 300; useDataset's example shows the Grid until it has room for its own",
};

describe("the component catalogue", () => {
  test("catalogue.json is what the source holds now", () => {
    const written = readFileSync(new URL("../catalogue.json", import.meta.url), "utf8");
    expect(written, "catalogue.json is stale: run vp run @basis/ui#catalogue").toBe(
      catalogueText(),
    );
  });

  test("every component, hook, function and module says what it is for", () => {
    const silent = [...catalogue.components, ...catalogue.functions, ...catalogue.modules].filter(
      (entry) => entry.purpose === "",
    );
    expect(
      silent.map((entry) => entry.name),
      "give each a doc comment saying what it is for",
    ).toStrictEqual([]);
  });

  test("every prop the packages declare themselves says what it does", () => {
    const undescribed = catalogue.components.flatMap((entry) =>
      entry.props
        .filter((prop) => prop.from === undefined && prop.description === "")
        .map((prop) => `${entry.name}.${prop.name}`),
    );
    expect(undescribed, "give each prop a doc comment saying what it does").toStrictEqual([]);
  });

  test("every family has an example", () => {
    const families = Map.groupBy(
      catalogue.components,
      (entry) => `${entry.module} ${entry.family}`,
    );
    const without = [...families].flatMap(([family, members]) =>
      members.some((member) => member.example !== undefined) || family in examplesWaiting
        ? []
        : [family],
    );
    expect(without, "add an @example to the family's main component").toStrictEqual([]);
  });
});

describe("what the component catalogue lists", () => {
  test("lists the components an app builds with, with their props and variants", () => {
    const button = component("Button");
    expect(button?.variants["variant"]?.options).toContain("outline");
    expect(button?.extends).toStrictEqual(['ComponentProps<"button">']);
    expect(component("DataTable")?.props.find((prop) => prop.name === "rowCap")?.optional).toBe(
      true,
    );
    expect(catalogue.icons.length).toBeGreaterThan(0);
  });

  test("lists the props a component takes from Base UI, with their docs and defaults", () => {
    const select = component("Select");
    const names = select?.props.map((prop) => prop.name);
    expect(names).toStrictEqual(expect.arrayContaining(["items", "value", "onValueChange"]));
    const modal = select?.props.find((prop) => prop.name === "modal");
    expect(modal).toMatchObject({ default: "true", from: "@base-ui/react" });
    expect(modal?.description).not.toBe("");
  });

  test("a component's own prop wins over the one it narrows from Base UI", () => {
    const className = component("SelectTrigger")?.props.find((prop) => prop.name === "className");
    expect(className?.from).toBeUndefined();
    expect(className?.type).toBe("string");
  });

  test("lists the hooks and functions beside the components, and the subpath modules", () => {
    const names = catalogue.functions.map((entry) => `${entry.module} ${entry.kind} ${entry.name}`);
    expect(names).toStrictEqual(
      expect.arrayContaining([
        "@basis/ui constant toast",
        "@basis/ui hook useSession",
        "@basis/ui function numberText",
        "@basis/ui/dates function settlementDate",
        "@basis/parallax hook useDataset",
      ]),
    );
    expect(catalogue.modules.map((module) => module.name)).toStrictEqual(
      expect.arrayContaining(["@basis/ui/numbers", "@basis/ui/testing", "@basis/parallax"]),
    );
  });

  test("defines the types its entries name", () => {
    const defined = new Set(catalogue.types.map((type) => type.name));
    for (const name of [
      "DataTableColumn",
      "DisplayFormat",
      "DateRange",
      "NumericValue",
      "SignIn",
    ]) {
      expect(defined, name).toContain(name);
    }
    const column = catalogue.types.find((type) => type.name === "DataTableColumn");
    expect(column?.fields?.map((field) => field.name)).toStrictEqual(
      expect.arrayContaining(["id", "header", "value", "cell", "variant"]),
    );
  });

  test("lists parallax's components and every LayoutInput field, each described", () => {
    expect(component("Grid")?.module).toBe("@basis/parallax");
    const layout = catalogue.types.find((type) => type.name === "LayoutInput");
    const fields = layout?.fields ?? [];
    expect(fields.map((field) => field.name)).toStrictEqual(
      expect.arrayContaining(["group_by", "measures", "filters", "sort", "formats", "pinned"]),
    );
    expect(fields.filter((field) => field.description === "")).toStrictEqual([]);
    expect(fields.find((field) => field.name === "group_by")).toMatchObject({
      default: "[]",
      optional: true,
      type: "string[]",
    });
  });
});

describe("the component catalogue's examples and probes", () => {
  test("every example compiles, and every prop listed is one the component takes", () => {
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
          module: "@basis/ui",
          name: "Broken",
          props: [],
          purpose: "A broken example.",
          variants: {},
        },
      ],
    };
    expect(exampleErrors(broken)).toContain("broken.tsx");
  });

  test("a prop the component does not take is caught, by its name", () => {
    const button = component("Button");
    const wrong: Catalogue = {
      ...catalogue,
      components:
        button === undefined
          ? []
          : [
              {
                ...button,
                example: undefined,
                props: [{ description: "", name: "colour", optional: true, type: "string" }],
              },
            ],
    };
    expect(exampleErrors(wrong)).toContain(
      "The catalogue lists Button's colour, which it does not take",
    );
  });
});
