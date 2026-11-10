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
import type { NumberFormat, NumericValue, PriceFormat, Shown } from "./num-text.ts";

/** What every number component takes. */
interface NumberProps
  extends Omit<ComponentProps<"span">, "children">, VariantProps<typeof numVariants> {
  /** The number as the API sends it, a double; `null` shows the formatter's null text, which is empty, and NaN `—`. */
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

/** A number, by the formatter's defaults: a decimal at its own scale, an integer with none, a double with two.
 *
 * @use For a number on a page, rounded once by the formatter. For money, use Money; for a rate, Pct or Bps; for a
 * Treasury price, Price32; for a number whose API declares its format, Formatted.
 * @see Formatted, DateTime, CellBar, numberText
 *
 * @example
 * ```tsx
 * import { Bps, Money, Num, Pct, Price32 } from "@basis/ui";
 *
 * <Num value={1234.5} decimals={2} />; // 1,234.50
 * <Num value={-1250.5} signed />; // -1,250.50, in the loss colour
 * <Money value={2_500_000_000} abbreviate="B" />; // $2.5B
 * <Pct value={0.0525} />; // 5.25%: rates are fractions
 * <Bps value={0.0025} />; // 25.00 bp; decimals={0} shows 25 bp
 * <Price32 value={99.515625} />; // 99-16+
 * ```
 */
function Num({
  value,
  decimals,
  thousands,
  abbreviate,
  suffixes,
  negative,
  align,
  className,
  ...props
}: NumProps): ReactElement {
  return (
    <NumberText
      dataSlot="num"
      shown={numText(value, { abbreviate, decimals, negative, suffixes, thousands })}
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
 * told otherwise: `$1,234.50`, `-€12.00`, `$1.5M`, or with par suffixes `$1.5MM`. */
function Money({
  value,
  currency = "USD",
  decimals,
  thousands,
  abbreviate,
  suffixes,
  negative,
  align,
  className,
  ...props
}: MoneyProps): ReactElement {
  return (
    <NumberText
      dataSlot="money"
      shown={moneyText(value, currency, { abbreviate, decimals, negative, suffixes, thousands })}
      className={cn(moneyVariants({ align }), className)}
      {...props}
    />
  );
}

type PctProps = NumberProps & Omit<NumberFormat, "abbreviate" | "suffixes">;

/** A rate as a percentage, at two decimals unless told otherwise: 0.0525 is `5.25%`. */
function Pct({
  value,
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
      shown={pctText(value, { decimals, negative, thousands })}
      className={cn(pctVariants({ align }), className)}
      {...props}
    />
  );
}

type BpsProps = NumberProps & Omit<NumberFormat, "abbreviate" | "suffixes">;

/** A rate in basis points, from the fraction it arrives as: 0.0025 is `25.00 bp` at the formatter's two decimals for
 * a double, and `25 bp` with `decimals={0}`. */
function Bps({
  value,
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
      shown={bpsText(value, { decimals, negative, thousands })}
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
