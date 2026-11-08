/* The filter bar: a page's filters, kept in its address's search parameters, so a filtered view survives a reload and
 * can be sent as a link. The page reads them back with its route's `useSearch()`. */

import type { ReactElement } from "react";

import { Button } from "./button.tsx";
import { Field, FieldLabel } from "./field.tsx";
import { Input } from "./input.tsx";
import { NativeSelect, NativeSelectOption } from "./native-select.tsx";
import { useSearchState } from "./search-state.ts";

/** One filter: a search parameter's `name`, its `label`, and, for a choice, its `options`; free text without them. */
interface FilterField {
  readonly name: string;
  readonly label: string;
  readonly options?: readonly string[] | undefined;
}

/** One filter's control: a choice among its options, with "All" for none, or a text box. */
function FilterControl({
  field,
  value,
  onChange,
}: {
  readonly field: FilterField;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const id = `filter-${field.name}`;
  return (
    <Field className="w-48">
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.options === undefined ? (
        <Input
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <NativeSelect
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          <NativeSelectOption value="">All</NativeSelectOption>
          {field.options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}

/** The page's filters, each kept in a search parameter of the page's address, and a button that clears them. The
 * page's route declares the parameters in its `validateSearch` and reads them with `useSearch()`.
 *
 * @example
 * ```tsx
 * import { FilterBar } from "@basis/ui";
 *
 * <FilterBar
 *   filters={[
 *     { label: "Book", name: "book", options: ["Rates", "Credit"] },
 *     { label: "Issuer", name: "issuer" },
 *   ]}
 * />;
 * ```
 */
function FilterBar({ filters }: { readonly filters: readonly FilterField[] }): ReactElement {
  const { search, setSearch } = useSearchState();
  const set = (name: string, value: string): void => {
    setSearch({ ...search, [name]: value });
  };
  const clear = (): void => {
    const others = Object.entries(search).filter(
      ([name]) => !filters.some((field) => field.name === name),
    );
    setSearch(Object.fromEntries(others));
  };
  return (
    <search aria-label="Filters" className="flex flex-wrap items-end gap-3">
      {filters.map((field) => (
        <FilterControl
          key={field.name}
          field={field}
          value={search[field.name] ?? ""}
          onChange={(value) => {
            set(field.name, value);
          }}
        />
      ))}
      <Button variant="ghost" onClick={clear}>
        Clear filters
      </Button>
    </search>
  );
}

export { FilterBar };
export type { FilterField };
