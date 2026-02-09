import { describe, expect, it } from "vitest";

import { renderFineTuneDoctorReport, runFineTuneDoctor } from "../fine_tune_doctor";

function mockJob(overrides?: Partial<{
  id: string;
  status: string;
  model: string;
  fine_tuned_model: string | null;
  created_at: string | null;
  finished_at: string | null;
  trained_tokens: number | null;
  organization_id: string | null;
  training_file: string | null;
  validation_file: string | null;
}>) {
  return {
    id: "ftjob_123",
    status: "running",
    model: "gpt-4o-mini-2024-07-18",
    fine_tuned_model: null,
    created_at: "2026-02-09T00:00:00.000Z",
    finished_at: null,
    trained_tokens: 12345,
    organization_id: "org_test",
    training_file: "file_train_1",
    validation_file: "file_val_1",
    ...overrides,
  };
}

describe("fine_tune_doctor", () => {
  it("list mode includes expected fields in human report", async () => {
    const result = await runFineTuneDoctor(
      {
        list: true,
        limit: 20,
        events: false,
        json: false,
        dry_run: true,
      },
      {
        env: { OPENAI_API_KEY: "test-key" },
        now: () => new Date("2026-02-09T00:00:00.000Z"),
        listJobs: async () => [mockJob()],
        getJob: async () => mockJob(),
        listEvents: async () => [],
      }
    );

    const report = renderFineTuneDoctorReport(result);
    expect(report).toContain("Current time: 2026-02-09T00:00:00.000Z");
    expect(report).toContain("Jobs (1):");
    expect(report).toContain("ftjob_123");
    expect(report).toContain("model=gpt-4o-mini-2024-07-18");
    expect(report).toContain("organization_id=org_test");
  });

  it("json mode result is parseable and includes env/list/errors keys", async () => {
    const result = await runFineTuneDoctor(
      {
        list: true,
        limit: 5,
        events: false,
        json: true,
        dry_run: true,
      },
      {
        env: {},
        now: () => new Date("2026-02-09T00:00:00.000Z"),
        listJobs: async () => [],
        getJob: async () => mockJob(),
        listEvents: async () => [],
      }
    );

    const parsed = JSON.parse(JSON.stringify(result)) as {
      env: { has_api_key: boolean };
      list: unknown[];
      errors: string[];
    };
    expect(parsed.env.has_api_key).toBe(false);
    expect(Array.isArray(parsed.list)).toBe(true);
    expect(Array.isArray(parsed.errors)).toBe(true);
  });

  it("job_id mode calls getJob and returns job payload", async () => {
    let called = false;

    const result = await runFineTuneDoctor(
      {
        list: false,
        limit: 20,
        job_id: "ftjob_target",
        events: false,
        json: false,
        dry_run: true,
      },
      {
        env: { OPENAI_API_KEY: "test-key" },
        now: () => new Date("2026-02-09T00:00:00.000Z"),
        listJobs: async () => [],
        getJob: async (job_id: string) => {
          called = true;
          return mockJob({ id: job_id, status: "succeeded", fine_tuned_model: "ft:gpt-4o-mini:test" });
        },
        listEvents: async () => [],
      }
    );

    expect(called).toBe(true);
    expect(result.job?.id).toBe("ftjob_target");
    expect(result.job?.status).toBe("succeeded");
  });
});

