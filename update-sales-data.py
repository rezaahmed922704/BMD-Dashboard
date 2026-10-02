"""Replace the bundled dashboard CSV with a validated SalesData export.

Usage: py update-sales-data.py "path/to/SalesData.csv"
"""

import csv
import sys
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path


DESTINATION = Path(__file__).parent / "apps-script-dashboard-demo" / "AIL-Trade Data-2023-2026-new.csv"
COLUMNS = ["Date", "Year", "Month", "Zone", "Districts", "Dealer", "Sales"]
MONTHS = {month: number for number, month in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
)}


def main(source):
    data = []
    periods = Counter()
    mt_values = 0
    with source.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or {header.strip() for header in reader.fieldnames} != set(COLUMNS):
            raise ValueError("Expected CSV columns: " + ", ".join(COLUMNS))
        for line_number, record in enumerate(reader, 2):
            if None in record:
                raise ValueError(f"Line {line_number}: extra CSV fields (quote values containing commas)")
            row = {key.strip(): (value or "").strip() for key, value in record.items()}
            if not any(row.values()):
                continue
            if not row["Districts"] or not row["Year"] or row["Month"] not in MONTHS:
                raise ValueError(f"Line {line_number}: district, year, or month missing/invalid")
            year = int(row["Year"])
            value = row["Sales"].replace(",", "").strip()
            if value.upper().endswith(" MT"):
                mt_values += 1
                value = value[:-3].strip()
            if value in ("", "-", "#N/A"):
                value = "0"
            try:
                quantity = Decimal(value)
            except InvalidOperation as exc:
                raise ValueError(f"Line {line_number}: invalid Sales value {row['Sales']!r}") from exc
            if not quantity.is_finite():
                raise ValueError(f"Line {line_number}: non-finite Sales value")
            row["Sales"] = str(quantity)
            data.append(row)
            periods[(year, row["Month"])] += 1

    if not data:
        raise ValueError("No sales rows found")

    with DESTINATION.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(data)

    latest = max(periods, key=lambda period: (period[0], MONTHS[period[1]]))
    latest_total = sum(Decimal(row["Sales"]) for row in data if (int(row["Year"]), row["Month"]) == latest)
    print(f"Updated {DESTINATION}")
    print(f"Rows: {len(data)}; 'MT' values normalized: {mt_values}")
    print(f"Latest: {latest[0]} {latest[1]}, {periods[latest]} rows, {latest_total} MT")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
