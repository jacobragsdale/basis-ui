---
metadata:
  basis-ui: "managed by basis-ui: `vp run sync` rewrites it"
name: build-a-page
description: "Build a page of this app from an operation in the API's document: a table of what a GET lists, a page of one record, or a form for a body an operation takes. Use when asked for a new page, screen, form or view over the API, before writing one by hand."
---

# Building a page from an operation

A page starts from the operation that serves it, never from a blank file: the scaffold writes the route, the page, its
test and a fixture, all of which pass the app's checks as written.

```sh
vp run new table positions --operation list_positions   # a DataTable of the rows a GET answers
vp run new page bond --operation bond                   # a card of the fields a GET answers
vp run new form new-trade --operation book_trade        # a form for the body an operation takes
vp run fixtures new book_trade --status 422             # an error's body, for the form's error path
vp run fixtures check                                   # every fixture against openapi.json
```

It prints what to run next. An operation the document lacks fails with the closest ids it has.

## Then make it the page asked for

Look a component up before using it: `vp run docs Select` prints its purpose, props and an example, and `vp run docs
--search "date range"` finds one by purpose. The page is a `Page` with its title and actions. Reach for these first:

| For                             | Use                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A dashboard's figures           | `StatCard`, `Sparkline`                                                                                                            |
| Filters kept in the address     | `defineFilters`, `useFilters`, `FilterBar`, `filterRows`                                                                           |
| Named views a user saves        | `SavedViews` with `browserViewStore` or `apiViewStore`                                                                             |
| A few hundred rows with links   | `DataTable`, with `HeatCell` or `CellBar` in its cells; more rows: `show-data`                                                     |
| A record's facts                | `DescriptionList`, `Card`                                                                                                          |
| A form                          | `FormTextField`, `FormAmountField`, `FormDateField`, `FormSelectField`, `FormCheckboxField`, `submitErrors`, `UnsavedChangesGuard` |
| Dates, months, ranges           | `DatePicker`, `AsOfDatePicker`, `MonthPicker`, `DateRangePicker`                                                                   |
| Choosing                        | `Select`, `MultiSelect`, `Combobox`, `TreeSelect`, `EntityPicker`, `SecurityPicker`                                                |
| Numbers                         | `Num`, `Money`, `Pct`, `Bps`, `Price32`, `AmountInput`, `NumberField`                                                              |
| An action that cannot be undone | `TypedConfirmDialog`                                                                                                               |

- Data comes from the generated client in `src/api/client.ts`: its hooks for queries and mutations. Never `fetch`.
- A component's look is its `variant` and `size`; `className` only places it. Colours are the theme's tokens.
- A component renders as another element through `render`, as `<DialogTrigger render={<Button />}>`, never `asChild`.
- A number is shown by a number component, never by `toFixed`.

## Before saying it is done

Run `vp run verify` (the `verify-the-app` skill), then look at the page with `vp run shot /ROUTE` (the `drive-the-app`
skill), in both modes if colours changed.
