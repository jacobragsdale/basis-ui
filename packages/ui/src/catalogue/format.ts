/* The component catalogue's format, `basis-ui-catalogue/2`: what catalogue.json holds, as the Zod schema `vp run docs`
 * reads it with. It imports nothing but Zod, since the docs task runs in an app, where the catalogue's builder, which
 * needs oxc's parser, is not installed. */

import { z } from "zod";

/** The modules an entry is imported from, such as `@basis/ui`, `@basis/ui/dates` or `@basis/parallax`. */
const moduleName = z.string();

/** One prop: its type as written, whether it may be left out, what it does, and its default when one is declared. */
const propSchema = z.object({
  default: z.string().optional(),
  description: z.string(),
  /** The module the prop is declared in, when it is not the component's own, such as `@base-ui/react`. */
  from: z.string().optional(),
  name: z.string(),
  optional: z.boolean(),
  type: z.string(),
});

/** One variant: its options, and the one used when it is not set. */
const variantSchema = z.object({
  default: z.string().nullable(),
  options: z.array(z.string()),
});

const componentSchema = z.object({
  example: z.string().optional(),
  /** Types whose props the component also takes and the catalogue does not list, such as `ComponentProps<"div">`. */
  extends: z.array(z.string()),
  /** The component's family: the file it lives in, or the file whose family a file of parts belongs to. */
  family: z.string(),
  module: moduleName,
  name: z.string(),
  props: z.array(propSchema),
  purpose: z.string(),
  /** When to use it, and what to use instead: the `@use` of its doc comment. */
  use: z.string().optional(),
  variants: z.record(z.string(), variantSchema),
  /** What goes with it from other families and modules: the `@see` of its doc comment. */
  with: z.array(z.string()).optional(),
});

/** A hook, a function, a class or a constant a module exports. */
const functionSchema = z.object({
  example: z.string().optional(),
  kind: z.enum(["hook", "function", "class", "constant"]),
  module: moduleName,
  name: z.string(),
  purpose: z.string(),
  /** Its signature as the source declares it, such as `numberText(value: number, format?: NumberFormat): string`. */
  signature: z.string(),
  use: z.string().optional(),
  with: z.array(z.string()).optional(),
});

/** A named type that a component's props, a function's signature or another type refers to. */
const typeSchema = z.object({
  /** The type as written, when it is not an object of fields, such as `"minus" | "parentheses"`. */
  definition: z.string().optional(),
  /** Whether the module exports it, so an app can import it; a type that is not exported is listed for its shape. */
  exported: z.boolean(),
  /** Types whose fields it also has and the catalogue does not list. */
  extends: z.array(z.string()).optional(),
  /** Its fields, when it is an object type. */
  fields: z.array(propSchema).optional(),
  module: moduleName,
  name: z.string(),
  /** Its type parameters, as in `<Row>`. */
  parameters: z.string().optional(),
  purpose: z.string(),
});

/** A module an app imports from, and what it is for. */
const moduleSchema = z.object({
  name: moduleName,
  purpose: z.string(),
});

const catalogueSchema = z.object({
  components: z.array(componentSchema),
  format: z.literal("basis-ui-catalogue/2"),
  functions: z.array(functionSchema),
  /** The icons `@basis/ui` exports, each a component taking an SVG element's props. */
  icons: z.array(z.string()),
  modules: z.array(moduleSchema),
  package: z.literal("@basis/ui"),
  types: z.array(typeSchema),
});

type Catalogue = z.infer<typeof catalogueSchema>;
type CatalogueComponent = z.infer<typeof componentSchema>;
type CatalogueFunction = z.infer<typeof functionSchema>;
type CatalogueModule = z.infer<typeof moduleSchema>;
type CatalogueProp = z.infer<typeof propSchema>;
type CatalogueType = z.infer<typeof typeSchema>;
type CatalogueVariant = z.infer<typeof variantSchema>;

export { catalogueSchema };
export type {
  Catalogue,
  CatalogueComponent,
  CatalogueFunction,
  CatalogueModule,
  CatalogueProp,
  CatalogueType,
  CatalogueVariant,
};
