import { describe, it, expect } from "vitest";
import { decidePromotion } from "../ml/promotions/decision";
import type { MetricSummary } from "../ml/promotions/compare";

describe("promotion decision", () => {
  it("passes when candidate clears gates and improves primary metrics", () => {
    const champion: MetricSummary = {
      schema_valid_rate: 0.99,
      doctrine_avg: 0.95,
      groundedness_avg: 0.8,
      clarity_avg: 0.85,
      pass_rate: 0.9,
    };
    const candidate: MetricSummary = {
      schema_valid_rate: 0.995,
      doctrine_avg: 1.0,
      groundedness_avg: 0.82,
      clarity_avg: 0.9,
      pass_rate: 0.92,
    };
    const decision = decidePromotion({ candidateMetrics: candidate, championMetrics: champion });
    expect(decision.pass).toBe(true);
  });

  it("fails when doctrine zero-fail requirement is not met", () => {
    const champion: MetricSummary = {
      schema_valid_rate: 0.99,
      doctrine_avg: 0.95,
      groundedness_avg: 0.8,
      clarity_avg: 0.85,
      pass_rate: 0.9,
    };
    const candidate: MetricSummary = {
      schema_valid_rate: 0.995,
      doctrine_avg: 0.98,
      groundedness_avg: 0.82,
      clarity_avg: 0.9,
      pass_rate: 0.92,
    };
    const decision = decidePromotion({ candidateMetrics: candidate, championMetrics: champion });
    expect(decision.pass).toBe(false);
  });
});
