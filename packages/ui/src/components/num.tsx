/* The number components: Num, Money, Pct, Bps and Price32. Each shows a value by parallax's rules, through the
 * formatter, so a number reads the same in a card as in the grid (num-text.ts has the rules). Each takes the value
 * types APIs send: decimal text, a Decimal, a double or a bigint, and shows the formatter's null text for null.
 *
 * Every number is in tabular figures. `signed` colours a gain and a loss with the theme's `gain` and `loss` and always
 * writes the sign, since colour alone does not tell them apart for every reader; zero takes neither. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import {
  numVariants,
  numVariants as bpsVariants,
  numVariants as moneyVariants,
  numVariants as pctVariants,
  numVariants as price32Variants,
} from "./num-variants.ts";
import { bpsText, moneyText, numText, pctText, price32Text, signedText } from "./num-text.ts";
import type {
  BpsUnit,
  NumberFormat,
  NumericValue,
  PercentUnit,
  PriceFormat,
  Shown,
} from "./num-text.ts";

/** What every number component takes. */
interface NumberProps
  extends Omit<ComponentProps<"span">, "children">, VariantProps<typeof numVariants> {
  readonly value: NumericValue;
  /** Colour a gain `gain` and a loss `loss`, and write a plus sign before a gain. */
  readonly signed?: boolean | undefined;
}

/** The span every number component renders: its text, its sign when signed, and the colour of its direction.
 * `className` arrives with the component's own variant classes. */
function NumberText({
  shown,
  dataSlot,
  signed = false,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  readonly shown: Shown;
  readonly dataSlot: string;
  readonly signed?: boolean | undefined;
}): ReactElement {
  const direction = signed ? shown.direction : undefined;
  return (
    <span
      data-slot={dataSlot}
      data-direction={direction}
      className={cn(
        direction === "gain" && "text-gain",
        direction === "loss" && "text-loss",
        className,
      )}
      {...props}
    >
      {signed ? signedText(shown.text, shown.direction) : shown.text}
    </span>
  );
}

type NumProps = NumberProps & NumberFormat;

/** A number, by the formatter's defaults: a decimal at its own scale, an integer with none, a double with two. */
function Num({
  value,
  decimals,
  thousands,
  abbreviate,
  negative,
  align,
  className,
  ...props
}: NumProps): ReactElement {
  return (
    <NumberText
      dataSlot="num"
      shown={numText(value, { abbreviate, decimals, negative, thousands })}
      className={cn(numVariants({ align }), className)}
      {...props}
    />
  );
}

interface MoneyProps extends NumberProps, NumberFormat {
  /** The ISO 4217 code, which sets the symbol and the default decimals; USD unless set. */
  readonly currency?: string | undefined;
}

/** An amount of money, with its currency's symbol after the sign, at the currency's minor units unless abbreviated or
 * told otherwise: `$1,234.50`, `-€12.00`, `$1.5M`. */
function Money({
  value,
  currency = "USD",
  decimals,
  thousands,
  abbreviate,
  negative,
  align,
  className,
  ...props
}: MoneyProps): ReactElement {
  return (
    <NumberText
      dataSlot="money"
      shown={moneyText(value, currency, { abbreviate, decimals, negative, thousands })}
      className={cn(moneyVariants({ align }), className)}
      {...props}
    />
  );
}

interface PctProps extends NumberProps, Omit<NumberFormat, "abbreviate"> {
  /** `fraction`, the default, reads 0.0525 as 5.25%, as the formatter and `rateSuffixes` do; `percent` reads 5.25. */
  readonly unit?: PercentUnit | undefined;
}

/** A rate as a percentage, at two decimals unless told otherwise: 0.0525 is `5.25%`. */
function Pct({
  value,
  unit,
  decimals,
  thousands,
  negative,
  align,
  className,
  ...props
}: PctProps): ReactElement {
  return (
    <NumberText
      dataSlot="pct"
      shown={pctText(value, { decimals, negative, thousands }, unit)}
      className={cn(pctVariants({ align }), className)}
      {...props}
    />
  );
}

interface BpsProps extends NumberProps, Omit<NumberFormat, "abbreviate"> {
  /** `fraction`, the default, reads 0.0025 as 25 bp, as `rateSuffixes` does; `bp` reads 25. */
  readonly unit?: BpsUnit | undefined;
}

/** A rate in basis points, by the formatter's defaults for the value in basis points: 0.0025 is `25 bp`. */
function Bps({
  value,
  unit,
  decimals,
  thousands,
  negative,
  align,
  className,
  ...props
}: BpsProps): ReactElement {
  return (
    <NumberText
      dataSlot="bps"
      shown={bpsText(value, { decimals, negative, thousands }, unit)}
      className={cn(bpsVariants({ align }), className)}
      {...props}
    />
  );
}

type Price32Props = NumberProps & PriceFormat;

/** A Treasury price in 32nds, as US cash markets quote it: 99.515625 is `99-16+`, and 99.5078125 is `99-162`. */
function Price32({
  value,
  precision,
  rounding,
  align,
  className,
  ...props
}: Price32Props): ReactElement {
  return (
    <NumberText
      dataSlot="price32"
      shown={price32Text(value, { precision, rounding })}
      className={cn(price32Variants({ align }), className)}
      {...props}
    />
  );
}

export { Bps, Money, Num, Pct, Price32 };
