/* The grid toolbar's search box. Each keystroke is a new search, which the engine runs; Escape clears it. */

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  SearchIcon,
  XIcon,
} from "@basis/ui";
import type { KeyboardEvent, ReactNode, Ref } from "react";

interface SearchBoxProps {
  /** The search. */
  readonly text: string;
  /** What the search looks in, said on hover. */
  readonly hint: string;
  readonly onChange: (text: string) => void;
  /** The box's input, which Ctrl+F in the grid focuses. */
  readonly inputRef: Ref<HTMLInputElement>;
}

/** A search of the grid's text columns. */
function SearchBox({ text, hint, onChange, inputRef }: SearchBoxProps): ReactNode {
  const clear = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape" && text !== "") {
      // The Escape is spent clearing the search, so a maximized grid stays maximized.
      event.preventDefault();
      event.stopPropagation();
      onChange("");
    }
  };
  return (
    <InputGroup className="w-60 min-w-36 shrink">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        type="search"
        placeholder="Search…"
        aria-label="Search the grid"
        title={hint}
        value={text}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        onKeyDown={clear}
      />
      {text === "" ? null : (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear the search"
            onClick={() => {
              onChange("");
            }}
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export { SearchBox };
