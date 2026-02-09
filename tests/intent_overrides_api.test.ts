import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = {
  run: {
    run_id: "run-ovr-1",
    workspace_id: "workspace-a",
    results_json: {},
  } as { run_id: string; workspace_id: string; results_json: Record<string, unknown> },
};

const storeMock = {
  ensureWorkspaceForUser: vi.fn(async () => ({ id: "workspace-a" })),
  getRun: vi.fn(async () => storeState.run),
  updateRun: vi.fn(async (_runId: string, updates: { results_json?: Record<string, unknown> }) => {
    if (updates.results_json) {
      storeState.run = {
        ...storeState.run,
        results_json: updates.results_json,
      };
    }
  }),
};

vi.mock("../src/lib/intelligence/store", () => ({
  getStore: () => storeMock,
}));

vi.mock("../src/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "user-a",
            email: "user@example.com",
          },
        },
      }),
    },
  })),
}));

describe("intent overrides API", () => {
  beforeEach(() => {
    storeState.run = {
      run_id: "run-ovr-1",
      workspace_id: "workspace-a",
      results_json: {},
    };
    storeMock.ensureWorkspaceForUser.mockResolvedValue({ id: "workspace-a" });
    storeMock.getRun.mockImplementation(async () => storeState.run);
    storeMock.updateRun.mockClear();
  });

  it("rejects unauthorized access with 403", async () => {
    const { POST } = await import("../src/app/api/internal/runs/[run_id]/intent-overrides/route");
    storeMock.getRun.mockResolvedValueOnce({
      ...storeState.run,
      workspace_id: "workspace-b",
    });

    const request = new Request("http://localhost/api/internal/runs/run-ovr-1/intent-overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides: [{ tag: "clarity_communication", confirmed: true }] }),
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ run_id: "run-ovr-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("persists valid overrides and returns them on GET", async () => {
    const { POST, GET } = await import("../src/app/api/internal/runs/[run_id]/intent-overrides/route");

    const postReq = new Request("http://localhost/api/internal/runs/run-ovr-1/intent-overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        overrides: [{ tag: "clarity_communication", confirmed: true }],
      }),
    });
    const postRes = await POST(postReq as never, {
      params: Promise.resolve({ run_id: "run-ovr-1" }),
    });
    const postJson = (await postRes.json()) as Record<string, unknown>;

    expect(postRes.status).toBe(200);
    expect(postJson.intent_overrides).toBeTruthy();
    expect(storeMock.updateRun).toHaveBeenCalledTimes(1);

    const getReq = new Request("http://localhost/api/internal/runs/run-ovr-1/intent-overrides");
    const getRes = await GET(getReq as never, {
      params: Promise.resolve({ run_id: "run-ovr-1" }),
    });
    const getJson = (await getRes.json()) as Record<string, unknown>;

    expect(getRes.status).toBe(200);
    expect(getJson.intent_overrides).toBeTruthy();
    const intentOverrides = getJson.intent_overrides as { overrides: unknown[] };
    expect(Array.isArray(intentOverrides.overrides)).toBe(true);
    expect(intentOverrides.overrides).toHaveLength(1);
  });

  it("rejects invalid payload with 400", async () => {
    const { POST } = await import("../src/app/api/internal/runs/[run_id]/intent-overrides/route");

    const request = new Request("http://localhost/api/internal/runs/run-ovr-1/intent-overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        overrides: [{ tag: "unknown_tag", confirmed: true }],
      }),
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ run_id: "run-ovr-1" }),
    });
    expect(response.status).toBe(400);
  });
});
