import { buildSnapshotV2 } from "@/lib/decision/v2/snapshot/build_snapshot_v2";
import { SnapshotV2 } from "@/lib/decision/v2/conclusion_schema_v2";
import { DataPackV0 } from "./data_pack_v0";

export function buildSnapshotFromPack(pack: DataPackV0): SnapshotV2 {
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

  return buildSnapshotV2({
    quotes,
    invoices,
  });
}
