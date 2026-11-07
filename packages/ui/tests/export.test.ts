import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { Decimal } from "#numbers/index.ts";
import { downloadBlob, toCsv, toTsv } from "#utils/index.ts";
import type { Column } from "#utils/index.ts";

interface Position {
  readonly issuer: string;
  readonly par: bigint;
  readonly price: Decimal;
  readonly change: number;
  readonly callable: boolean;
  readonly note: string | null;
}

const columns: readonly Column<Position>[] = [
  { header: "Issuer", value: (row) => row.issuer },
  { header: "Par", value: (row) => row.par },
  { header: "Price", value: (row) => row.price },
  { header: "Change", value: (row) => row.change },
  { header: "Callable", value: (row) => row.callable },
  { header: "Note", value: (row) => row.note },
];

const positions: readonly Position[] = [
  {
    callable: true,
    change: -0.25,
    issuer: "Example Water Authority",
    note: null,
    par: 5_000_000n,
    price: Decimal.from("99.515625"),
  },
  {
    callable: false,
    change: Number.NaN,
    issuer: 'Placeholder "Co", Inc.',
    note: "line one\nline two",
    par: 250_000n,
    price: Decimal.from("-1.50"),
  },
];

describe("toCsv", () => {
  test("writes a header and a record a row, ending each with CRLF and quoting as RFC 4180 says", () => {
    expect(toCsv(positions, columns)).toBe(
      [
        "Issuer,Par,Price,Change,Callable,Note",
        "Example Water Authority,5000000,99.515625,-0.25,TRUE,",
        '"Placeholder ""Co"", Inc.",250000,-1.50,,FALSE,"line one\nline two"',
        "",
      ].join("\r\n"),
    );
  });

  test("writes only the header for no rows", () => {
    expect(toCsv([], columns)).toBe("Issuer,Par,Price,Change,Callable,Note\r\n");
  });

  test.each([
    ["=", '=HYPERLINK("https://example.com")', '"\'=HYPERLINK(""https://example.com"")"'],
    ["+", "+1+1", "'+1+1"],
    ["-", "-2+3+cmd|' /C calc'!A0", "'-2+3+cmd|' /C calc'!A0"],
    ["@", "@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["a tab", "\t=1+1", "'\t=1+1"],
    ["a carriage return", "\r=1+1", '"\'\r=1+1"'],
  ])("neutralises a text cell that starts with %s", (_start, text, written) => {
    expect(toCsv([text], [{ header: "Cell", value: (cell): string => cell }])).toBe(
      `Cell\r\n${written}\r\n`,
    );
  });

  test("leaves numbers alone, negative ones included, and neutralises a header", () => {
    const csv = toCsv([-5], [{ header: "=Total", value: (value): number => value }]);
    expect(csv).toBe("'=Total\r\n-5\r\n");
    expect(toCsv(["-5"], [{ header: "Text", value: (value): string => value }])).toBe(
      "Text\r\n'-5\r\n",
    );
  });
});

describe("toTsv", () => {
  test("separates by tabs and quotes a field that holds one", () => {
    const tsv = toTsv(
      [["a\tb", "c,d"]],
      [
        { header: "First", value: ([first]): string | undefined => first },
        { header: "Second", value: ([, second]): string | undefined => second },
      ],
    );
    expect(tsv).toBe('First\tSecond\r\n"a\tb"\tc,d\r\n');
  });
});

/** A document whose one link records what it was given and whether it was clicked. */
function stubLink(): { readonly click: () => void; download: string; href: string } {
  const link = { click: vi.fn<() => void>(), download: "", href: "" };
  vi.stubGlobal("document", { createElement: () => link });
  return link;
}

describe("downloadBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("clicks a temporary link to the blob", () => {
    const link = stubLink();
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:positions");
    const blob = new Blob([toCsv(positions, columns)], { type: "text/csv" });
    downloadBlob("positions.csv", blob);
    expect(created).toHaveBeenCalledWith(blob);
    expect(link).toMatchObject({ download: "positions.csv", href: "blob:positions" });
    expect(link.click).toHaveBeenCalledOnce();
  });

  test("frees the blob's URL a minute after the click", () => {
    vi.useFakeTimers();
    stubLink();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:positions");
    const revoked = vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    downloadBlob("positions.csv", new Blob(["x"]));
    vi.advanceTimersByTime(59_999);
    expect(revoked).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoked).toHaveBeenCalledWith("blob:positions");
  });
});
