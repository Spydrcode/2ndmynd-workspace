import { describe, expect, it } from "vitest";

import {
  SecondLookIntakeV2Schema,
  validateSecondLookIntakeV2,
  type SecondLookIntakeV2,
} from "../second_look_intake_v2";
import {
  SecondLookArtifactV2Schema,
  validateSecondLookArtifactV2,
  type SecondLookArtifactV2,
} from "../second_look_artifact_v2";

const intakeFixture: SecondLookIntakeV2 = {
  business_name: "Diamondback Propane",
  website_url: "https://diamondback.example",
  google_business_url: "https://maps.google.com/?cid=123",
  snapshot_window: { mode: "last_90_days" },
  owner_values_top3: ["safety_compliance", "customer_communication", "reliability_ontime"],
  pressure_sources_top2: ["compliance_risk", "tools_message_overload"],
  emyth_role_split: "technician",
  voice_note_1_text: "Customers call after hours when tanks run low.",
  voice_note_2_text: "I need escalation clarity and less interruption.",
  optional_tags: ["propane", "residential"],
  consent_flags: { data_ok: true },
};

const install = {
  install_id: "install-1",
  what: "Escalation matrix for delivery exceptions",
  why: "Prevent missed handoffs during safety-critical windows",
  owner_time_minutes: 45,
  executor: "team" as const,
  done_when: "Matrix is posted and team can run it without owner interruption",
};

const artifactFixture: SecondLookArtifactV2 = {
  meta: {
    business_name: "Diamondback Propane",
    generated_at: "2026-02-09T12:00:00.000Z",
    snapshot_window: { mode: "last_90_days" },
    confidence: "medium",
    confidence_reason: "Quotes/invoices coverage is solid, dispatch data is partial.",
  },
  north_star: {
    values_top3: ["safety_compliance", "customer_communication", "reliability_ontime"],
    non_negotiables_summary: "Safety steps are never skipped.",
    wants_less_of_summary: "Fewer owner interruptions and fewer dropped messages.",
  },
  primary_constraint: {
    statement: "Escalations are inconsistent when schedule pressure spikes.",
    why_this: "Message load and compliance pressure collide during peak dispatch windows.",
    evidence_buckets: [
      {
        bucket_id: "dispatch-volatility",
        label: "Dispatch volatility",
        summary: "High week-to-week swings in approvals and invoicing windows.",
        signal_count: 3,
      },
    ],
  },
  lenses_included: ["emyth", "porter", "constructive", "safety_risk", "customer_comms"],
  modules: [
    {
      module_id: "safety_risk_protocols",
      title: "Safety escalation protocol",
      narrative: "Codify who acts first when delivery safety risks appear.",
      bullets: ["Define severity levels", "Set owner-only triggers"],
      installs: [install],
      evidence_buckets: [
        {
          bucket_id: "compliance-risk",
          label: "Compliance risk",
          summary: "Late or unclear escalation paths appear in aggregate event buckets.",
        },
      ],
    },
  ],
  decision_paths: {
    path_A: {
      label: "Stabilize reliability",
      thesis: "Build protocol-first dispatch control before adding growth moves.",
      why: "Reduces avoidable escalation pressure immediately.",
      tradeoffs: ["Slower experimentation for 30 days"],
      installs: [install],
    },
    path_B: {
      label: "Communication-first relief",
      thesis: "Set customer update cadence and light escalation rules.",
      why: "Cuts uncertainty for customers and team.",
      tradeoffs: ["Requires discipline on message ownership"],
      installs: [install],
    },
    neither: {
      copy: "Pause major changes this week and only confirm evidence gaps.",
    },
  },
  plan: {
    actions_7_days: [install],
    actions_30_days: [install],
    boundaries: [
      "Do not skip safety checklists to catch up schedule.",
      "Do not introduce more than one new routing rule this week.",
    ],
  },
  support_options: {
    self_implement: "Use the installs exactly as written with one team owner.",
    ongoing_help: "2ndmynd can facilitate the first 30-day install cadence.",
  },
  talk_track_90s: "Primary pressure is escalation reliability under compliance load. Path A stabilizes first, Path B reduces communication drag.",
  appendix: {
    notes: ["Signals shown are aggregate buckets only."],
  },
};

describe("Second Look V2 contracts", () => {
  it("validates intake with strict contract", () => {
    const parsed = SecondLookIntakeV2Schema.parse(intakeFixture);
    expect(parsed.business_name).toBe("Diamondback Propane");

    const validation = validateSecondLookIntakeV2(intakeFixture);
    expect(validation.ok).toBe(true);
  });

  it("rejects unknown intake fields", () => {
    const input = {
      ...intakeFixture,
      unknown_field: "not-allowed",
    };

    const zod = SecondLookIntakeV2Schema.safeParse(input);
    expect(zod.success).toBe(false);

    const ajv = validateSecondLookIntakeV2(input);
    expect(ajv.ok).toBe(false);
  });

  it("validates assembled artifact with strict contract", () => {
    const parsed = SecondLookArtifactV2Schema.parse(artifactFixture);
    expect(parsed.decision_paths.path_A.label).toBeTruthy();

    const validation = validateSecondLookArtifactV2(artifactFixture);
    expect(validation.ok).toBe(true);
  });

  it("rejects unknown nested artifact fields", () => {
    const input = {
      ...artifactFixture,
      modules: [
        {
          ...artifactFixture.modules[0],
          unknown_nested: true,
        },
      ],
    };

    const zod = SecondLookArtifactV2Schema.safeParse(input);
    expect(zod.success).toBe(false);

    const ajv = validateSecondLookArtifactV2(input);
    expect(ajv.ok).toBe(false);
  });
});
