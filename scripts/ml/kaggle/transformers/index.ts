import path from "node:path";

import { transformCallCenter } from "../transform_call_center";
import { transformLatePaymentHistories } from "../transform_late_payment_histories";
import { transformNoshowAppointments } from "../transform_noshowappointments";
import { SnapshotV1 } from "../transformer_types";

export type Transformer = (datasetPath: string) => SnapshotV1[];

export type TransformerEntry = {
  slug: string;
  transformer: Transformer;
};

export const TRANSFORMERS: TransformerEntry[] = [
  {
    slug: "joniarroba/noshowappointments",
    transformer: transformNoshowAppointments,
  },
  {
    slug: "datazng/telecom-company-churn-rate-call-center-data",
    transformer: transformCallCenter,
  },
  {
    slug: "ibm/late-payment-histories",
    transformer: transformLatePaymentHistories,
  },
];

export function slugToDir(slug: string) {
  return path.join("seed", "kaggle", slug);
}

export function slugToOutput(slug: string) {
  return path.join(
    "seed",
    "kaggle_transformed",
    `${slug.replace(/[\\/]/g, "_")}.snapshots.json`
  );
}
