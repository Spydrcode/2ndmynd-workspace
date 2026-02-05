"""
Internal-only plotting utility for snapshot evidence charts.

Usage:
  python scripts/plots/plot_snapshot_insights.py --run_id mock_<bundle_name>
  python scripts/plots/plot_snapshot_insights.py --quotes path/to/quotes.csv --invoices path/to/invoices.csv
"""

import argparse
import csv
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import matplotlib.pyplot as plt


def parse_date(value: str) -> Optional[datetime]:
  if not value:
    return None
  for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y", "%m/%d/%Y %H:%M", "%m/%d/%Y %I:%M %p"):
    try:
      return datetime.strptime(value.strip(), fmt)
    except ValueError:
      continue
  try:
    return datetime.fromisoformat(value.strip().replace("Z", ""))
  except ValueError:
    return None


def parse_float(value: str) -> Optional[float]:
  if not value:
    return None
  cleaned = "".join(ch for ch in value if (ch.isdigit() or ch in ".-"))
  try:
    return float(cleaned)
  except ValueError:
    return None


def pick_value(row: dict, keys: List[str]) -> Optional[str]:
  for key in keys:
    if key in row and row[key]:
      return row[key]
  return None


def read_csv_rows(path: Path) -> List[dict]:
  if not path.exists():
    return []
  with path.open("r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = []
    for row in reader:
      rows.append({k.strip().lower(): (v or "").strip() for k, v in row.items() if k})
    return rows


def get_invoice_points(rows: List[dict]) -> List[Tuple[datetime, float]]:
  points = []
  for row in rows:
    date_raw = pick_value(row, ["issued_at", "issued date", "issued_date", "created_at", "created date", "date"])
    total_raw = pick_value(row, ["total", "amount", "total ($)", "total$", "total_amount"])
    date = parse_date(date_raw or "")
    total = parse_float(total_raw or "")
    if date and total is not None:
      points.append((date, total))
  return sorted(points, key=lambda x: x[0])


def get_quote_dates(rows: List[dict]) -> List[datetime]:
  dates = []
  for row in rows:
    date_raw = pick_value(row, ["created_at", "created date", "date", "issued_at"])
    date = parse_date(date_raw or "")
    if date:
      dates.append(date)
  return dates


def rolling_median(values: List[float], window: int = 7) -> List[float]:
  if not values:
    return []
  out = []
  for i in range(len(values)):
    start = max(0, i - window + 1)
    subset = sorted(values[start : i + 1])
    mid = len(subset) // 2
    if len(subset) % 2 == 1:
      out.append(subset[mid])
    else:
      out.append((subset[mid - 1] + subset[mid]) / 2)
  return out


def resolve_bundle_from_run_id(run_id: str) -> Optional[Path]:
  if run_id.startswith("mock_"):
    bundle_name = run_id.replace("mock_", "", 1)
    candidate = Path("mock_runs") / bundle_name
    if candidate.exists():
      return candidate
  candidate = Path("runs") / run_id
  if candidate.exists():
    return candidate
  return None


def plot_snapshot_insights(quotes_csv: Path, invoices_csv: Path, output_dir: Path):
  output_dir.mkdir(parents=True, exist_ok=True)

  quote_rows = read_csv_rows(quotes_csv)
  invoice_rows = read_csv_rows(invoices_csv)

  invoice_points = get_invoice_points(invoice_rows)
  quote_dates = get_quote_dates(quote_rows)

  # Plot 1: Scatter invoice total vs date with rolling median
  if invoice_points:
    dates = [p[0] for p in invoice_points]
    totals = [p[1] for p in invoice_points]
    median = rolling_median(totals, window=7)

    plt.figure(figsize=(8, 4))
    plt.scatter(dates, totals, alpha=0.6, s=20)
    plt.plot(dates, median, color="orange", linewidth=2)
    plt.title("Invoice totals over time")
    plt.xlabel("Date")
    plt.ylabel("Invoice total")
    plt.tight_layout()
    plt.savefig(output_dir / "invoice_scatter.png")
    plt.close()

  # Plot 2: Histogram of invoice totals
  if invoice_points:
    totals = [p[1] for p in invoice_points]
    plt.figure(figsize=(6, 4))
    plt.hist(totals, bins=12, color="#0f766e", alpha=0.8)
    plt.title("Invoice total distribution")
    plt.xlabel("Invoice total")
    plt.ylabel("Count")
    plt.tight_layout()
    plt.savefig(output_dir / "invoice_hist.png")
    plt.close()

  # Plot 3: Histogram of quote ages
  if quote_dates:
    as_of = max(quote_dates)
    ages = [(as_of - d).days for d in quote_dates if d <= as_of]
    plt.figure(figsize=(6, 4))
    plt.hist(ages, bins=12, color="#2563eb", alpha=0.8)
    plt.title("Quote age distribution (days)")
    plt.xlabel("Age (days)")
    plt.ylabel("Count")
    plt.tight_layout()
    plt.savefig(output_dir / "quote_age_hist.png")
    plt.close()


def main():
  parser = argparse.ArgumentParser(description="Plot snapshot evidence charts")
  parser.add_argument("--run_id", help="Run ID to locate mock bundle")
  parser.add_argument("--quotes", help="Path to quotes CSV")
  parser.add_argument("--invoices", help="Path to invoices CSV")
  parser.add_argument("--calendar", help="Path to calendar CSV (optional)")
  parser.add_argument("--out", help="Output directory override")

  args = parser.parse_args()

  quotes_csv = Path(args.quotes) if args.quotes else None
  invoices_csv = Path(args.invoices) if args.invoices else None

  if args.run_id and (quotes_csv is None or invoices_csv is None):
    bundle = resolve_bundle_from_run_id(args.run_id)
    if not bundle:
      raise SystemExit("Unable to locate bundle for run_id")
    quotes_csv = bundle / "quotes_export.csv"
    invoices_csv = bundle / "invoices_export.csv"

  if not quotes_csv or not invoices_csv:
    raise SystemExit("Provide --run_id or both --quotes and --invoices paths")

  output_dir = Path(args.out) if args.out else Path("runs") / (args.run_id or "adhoc") / "plots"
  plot_snapshot_insights(quotes_csv, invoices_csv, output_dir)
  print(f"Wrote plots to {output_dir}")


if __name__ == "__main__":
  main()
