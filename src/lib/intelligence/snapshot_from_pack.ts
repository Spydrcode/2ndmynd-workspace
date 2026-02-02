import { buildSnapshotV2 } from "@/lib/decision/v2/snapshot/build_snapshot_v2";
import { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import { DataPackV0 } from "./data_pack_v0";

export type InputRecognitionReport = {
  quotes_detected_count: number;
  invoices_detected_count: number;
  invoices_paid_detected_count: number;
  reasons_dropped: string[];
};

function toISODate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function pickTopReasons(counts: Map<string, number>, limit: number) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export function buildSnapshotFromPack(
  pack: DataPackV0,
  options?: { report_date?: string; lookback_days?: number }
): { snapshot: SnapshotV2; input_recognition: InputRecognitionReport } {
  const quotes = (pack.quotes ?? []).map((q) => ({
    created_at: q.created_at,
    approved_at: q.approved_at,
    status: q.status,
    total: q.total,
  }));

  const invoices = (pack.invoices ?? []).map((inv) => ({
    issued_at: inv.issued_at,
    paid_at: inv.paid_at,
    status: inv.status,
    total: inv.total,
  }));

  const snapshot = buildSnapshotV2({
    quotes,
    invoices,
    report_date: options?.report_date,
    lookback_days: options?.lookback_days,
  });

  const dropped = new Map<string, number>();
  const sliceStart = snapshot.window.slice_start;
  const sliceEnd = snapshot.window.slice_end;

  for (const q of pack.quotes ?? []) {
    const created = toISODate(q.created_at);
    if (!created) {
      dropped.set("Quote rows missing a usable created date.", (dropped.get("Quote rows missing a usable created date.") ?? 0) + 1);
      continue;
    }
    if (created < sliceStart || created > sliceEnd) {
      dropped.set("Quote rows outside the snapshot window.", (dropped.get("Quote rows outside the snapshot window.") ?? 0) + 1);
    }
  }

  for (const inv of pack.invoices ?? []) {
    const issued = toISODate(inv.issued_at);
    if (!issued) {
      dropped.set(
        "Invoice rows missing a usable issued/created date.",
        (dropped.get("Invoice rows missing a usable issued/created date.") ?? 0) + 1
      );
      continue;
    }
    if (issued < sliceStart || issued > sliceEnd) {
      dropped.set(
        "Invoice rows outside the snapshot window.",
        (dropped.get("Invoice rows outside the snapshot window.") ?? 0) + 1
      );
    }
  }

  return {
    snapshot,
    input_recognition: {
      quotes_detected_count: snapshot.activity_signals.quotes.quotes_count,
      invoices_detected_count: snapshot.activity_signals.invoices.invoices_count,
      invoices_paid_detected_count: snapshot.activity_signals.invoices.invoices_paid_count,
      reasons_dropped: pickTopReasons(dropped, 3),
    },
  };
}
