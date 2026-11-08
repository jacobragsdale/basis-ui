import datetime as dt, random, sys
from pathlib import Path
import openpyxl, xlwt
out = Path(sys.argv[1])
random.seed(7)
header = ["CUSIP", "Description", "Par", "Price", "Yield", "Trade date", "Settle date", "Book", "Callable", "Coupon", "Maturity", "Notes"]
books = ["Rates", "Credit", "Munis", "Agency"]
def rows(n):
    for i in range(n):
        td = dt.date(2026, 1, 2) + dt.timedelta(days=i % 300)
        yield [f"{random.randrange(10**8):08d}{random.randrange(10)}", f"Issuer {i % 997} {random.choice(['GO','REV','SER A'])} {2030 + i % 20}",
               random.randrange(1, 500) * 5000, round(random.uniform(90, 110), 3), round(random.uniform(0.01, 0.06), 5),
               td, td + dt.timedelta(days=2), random.choice(books), random.random() < 0.3, random.choice([2.5, 3.0, 4.125, 5.0]),
               dt.date(2030 + i % 20, 6, 1), "" if i % 4 else f"note {i}"]
def xlsx(n, path):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Positions"
    ws.append(header)
    for r in rows(n): ws.append(r)
    for col in "FGK":
        for c in ws[col][1:]: c.number_format = "yyyy-mm-dd"
    wb.create_sheet("Notes").append(["Generated for the reader spike"])
    wb.save(path)
def xls(n, path):
    wb = xlwt.Workbook(); ws = wb.add_sheet("Positions"); dfmt = xlwt.easyxf(num_format_str="YYYY-MM-DD")
    for j, h in enumerate(header): ws.write(0, j, h)
    for i, r in enumerate(rows(n), 1):
        for j, v in enumerate(r): ws.write(i, j, v, dfmt) if isinstance(v, dt.date) else ws.write(i, j, v)
    wb.save(path)
xlsx(10_000, out / "positions-10k.xlsx")
xlsx(60_000, out / "positions-60k.xlsx")
xls(10_000, out / "positions-10k.xls")
