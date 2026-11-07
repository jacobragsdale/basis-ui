/**
 * @license class-variance-authority 0.7.1, Apache-2.0. Copyright 2022 Joe Bell. The license is in
 * src/vendor/cva/LICENSE, beside this file.
 *
 * Copied from the npm package class-variance-authority@0.7.1 (dist/index.mjs, dist/index.d.ts and dist/types.d.ts;
 * source at https://github.com/joe-bell/cva), and changed by basis-ui: rewritten in strict TypeScript to pass
 * @basis/ui's lint, with `any` replaced by `never` and `unknown`, `cx` left out, and the vendored clsx in place of the
 * clsx package. It behaves as the original does. The function keeps the name `cva`, because `@shadcn/lint` finds a
 * component's variants by that name.
 */

import { clsx } from "#vendor/clsx/clsx.ts";
import type { ClassValue } from "#vendor/clsx/clsx.ts";

/** A call's own classes, through `class` or `className` but not both. */
type ClassProp =
  | { readonly class: ClassValue; readonly className?: never }
  | { readonly class?: never; readonly className: ClassValue }
  | { readonly class?: never; readonly className?: never };

type OmitUndefined<Value> = Value extends undefined ? never : Value;
type StringToBoolean<Key> = Key extends "true" | "false" ? boolean : Key;

/** The variant props a `cva` function takes, such as `{ variant?: "default" | "outline"; size?: "sm" }`. */
type VariantProps<Component extends (...args: never) => unknown> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  "class" | "className"
>;

type ConfigSchema = Record<string, Record<string, ClassValue>>;

type ConfigVariants<Schema extends ConfigSchema> = {
  readonly [Variant in keyof Schema]?: StringToBoolean<keyof Schema[Variant]> | null | undefined;
};

type ConfigVariantsMulti<Schema extends ConfigSchema> = {
  readonly [Variant in keyof Schema]?:
    | StringToBoolean<keyof Schema[Variant]>
    | readonly StringToBoolean<keyof Schema[Variant]>[]
    | undefined;
};

type Config<Schema> = Schema extends ConfigSchema
  ? {
      readonly variants?: Schema;
      readonly defaultVariants?: ConfigVariants<Schema>;
      readonly compoundVariants?: readonly ((ConfigVariants<Schema> | ConfigVariantsMulti<Schema>) &
        ClassProp)[];
    }
  : never;

type Props<Schema> = Schema extends ConfigSchema ? ConfigVariants<Schema> & ClassProp : ClassProp;

/** A call's props, or a compound variant's conditions and classes, whatever the variants. */
type AnyProps = Readonly<Record<string, unknown>> & {
  readonly class?: ClassValue;
  readonly className?: ClassValue;
};

type AnyVariants = Readonly<Record<string, Readonly<Record<string, ClassValue>>>>;

/** A configuration, whatever its variants. */
interface AnyConfig {
  readonly variants?: AnyVariants | null;
  readonly defaultVariants?: Readonly<Record<string, unknown>>;
  readonly compoundVariants?: readonly AnyProps[];
}

/** A variant's value as the key of its classes: `true` and `false` become strings, and so does 0. */
function asKey(value: unknown): unknown {
  if (typeof value === "boolean") {
    return String(value);
  }
  return value === 0 ? "0" : value;
}

/** The key of the classes a variant chooses: the prop's value when it is truthy as a key, else the default's. */
function chosenKey(given: unknown, fallback: unknown): string {
  const own = asKey(given);
  const truthy = Boolean(own);
  return String(truthy ? own : asKey(fallback));
}

/** The class each variant chooses. An explicit `null` chooses none, not even the default. */
function variantClasses(
  variants: AnyVariants,
  defaults: AnyConfig["defaultVariants"],
  props: AnyProps | undefined,
): ClassValue[] {
  return Object.keys(variants).map((variant) => {
    const given = props?.[variant];
    if (given === null) {
      return null;
    }
    return variants[variant]?.[chosenKey(given, defaults?.[variant])];
  });
}

/** Whether a compound variant's conditions all hold, each a value or a list of values. */
function matches(
  conditions: Readonly<Record<string, unknown>>,
  chosen: Readonly<Record<string, unknown>>,
): boolean {
  return Object.entries(conditions).every(([key, value]) =>
    Array.isArray(value) ? value.includes(chosen[key]) : chosen[key] === value,
  );
}

/** The classes of every compound variant whose conditions hold for the defaults overlaid by the props given. */
function compoundClasses(config: AnyConfig, props: AnyProps | undefined): ClassValue[] | undefined {
  const given = Object.fromEntries(
    Object.entries(props ?? {}).filter(([, value]) => value !== undefined),
  );
  const chosen = { ...config.defaultVariants, ...given };
  return config.compoundVariants?.flatMap(({ class: own, className, ...conditions }) =>
    matches(conditions, chosen) ? [own, className] : [],
  );
}

/** A function from variant props to a class string: the base classes, each variant's classes, the compound variants'
 * classes, then the call's own `class` and `className`. */
function cva<Schema>(base?: ClassValue, config?: Config<Schema>): (props?: Props<Schema>) => string;
function cva(base?: ClassValue, config?: AnyConfig): (props?: AnyProps) => string {
  return (props) => {
    if (config?.variants === undefined || config.variants === null) {
      return clsx(base, props?.class, props?.className);
    }
    return clsx(
      base,
      variantClasses(config.variants, config.defaultVariants, props),
      compoundClasses(config, props),
      props?.class,
      props?.className,
    );
  };
}

export { cva };
export type { VariantProps };
