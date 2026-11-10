/* An active filter in words, as its chip shows it and a screen reader reads it: the text, the option's label, the
 * options' labels, the dates, or the numbers in full, as the formatter writes them. */

import {
  chosenOf,
  isDateRangeValue,
  isNumberRangeValue,
  optionLabel,
} from "./filter-definitions.ts";
import type { FilterDefinition, NumberRangeFilterValue } from "./filter-definitions.ts";
import { exactText } from "./num-text.ts";

/** The digits a double is shown with, as the formatter reads one. */
const significantDigits = 15;

/** A number in full, as AmountInput echoes it: `5000000` is `5,000,000`. */
function numberInFull(value: number): string {
  const rounded = Number(value.toPrecision(significantDigits));
  return exactText(String(rounded));
}

function numberRangeText({ min, max }: NumberRangeFilterValue): string {
  if (min === undefined) {
    return max === undefined ? "" : `at most ${numberInFull(max)}`;
  }
  return max === undefined
    ? `at least ${numberInFull(min)}`
    : `${numberInFull(min)} – ${numberInFull(max)}`;
}

/** What an active filter holds, in words: `Rates`, `Rates, Credit`, `2026-10-01 – 2026-10-31`, `at least 5,000,000`. */
function filterValueText(definition: FilterDefinition, value: unknown): string {
  switch (definition.kind) {
    case "text": {
      return typeof value === "string" ? value : "";
    }
    case "choice": {
      return typeof value === "string" ? optionLabel(definition, value) : "";
    }
    case "multiChoice": {
      return chosenOf(value)
        .map((option) => optionLabel(definition, option))
        .join(", ");
    }
    case "dateRange": {
      if (!isDateRangeValue(value)) {
        return "";
      }
      return value.start === value.end ? value.start : `${value.start} – ${value.end}`;
    }
    case "numberRange": {
      return isNumberRangeValue(value) ? numberRangeText(value) : "";
    }
    default: {
      return "";
    }
  }
}

export { filterValueText };
