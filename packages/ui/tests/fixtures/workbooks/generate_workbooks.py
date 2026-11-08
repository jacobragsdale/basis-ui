"""Writes the workbooks the import's tests read, with openpyxl, as a library that is not Excel writes them.

Run it with `uv run --no-project --with openpyxl==3.1.5 python generate_workbooks.py` from this folder; the tests
read the files it writes and say what they hold, so a change here needs one there.
"""

import datetime as dt
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent


def positions() -> None:
    """A positions sheet as a desk keeps one: dates, a date and time, percents, booleans, a blank row, an empty cell,
    a hidden sheet before it, and a price whose double openpyxl writes with 17 digits. openpyxl writes text as inline
    strings, where Excel uses shared ones."""
    book = openpyxl.Workbook()
    hidden = book.active
    hidden.title = "Lists"
    hidden.append(["Rates", "Credit"])
    hidden.sheet_state = "hidden"
    sheet = book.create_sheet("Positions")
    sheet.append(["CUSIP", "Par", "Price", "Coupon", "Settles", "Callable", "Book"])
    sheet.append(["037833100", 1_000_000, 90.96599999999999, 0.0425, dt.date(2026, 11, 9), True, "Rates"])
    sheet.append([])
    sheet.append(["91282CRF0", 250_000, 0.1 + 0.2, 0.05, dt.datetime(2026, 11, 10, 9, 30), False, None])
    sheet["D2"].number_format = "0.00%"
    sheet["D4"].number_format = "0.00%"
    sheet["E2"].number_format = "yyyy-mm-dd"
    sheet["E4"].number_format = "m/d/yyyy h:mm"
    book.create_sheet("Notes").append(["Written by generate_workbooks.py"])
    book.save(HERE / "openpyxl-positions.xlsx")


if __name__ == "__main__":
    positions()
