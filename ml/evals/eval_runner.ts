import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { EvalCase, EvalResult } from "../logging/log_types";
import { validateEvalCase, validateEvalResult, assertValid } from "../schemas/validators";
import { gradeSchema } from "./graders/grade_schema";
import { gradeDoctrine } from "./graders/grade_doctrine";
import { gradeGroundedness } from "./graders/grade_groundedness";
import { gradeClarityArtifact } from "./graders/grade_clarity_artifact";
import { gradeToolChoice } from "./graders/grade_tool_choice";
import { loadRegistry } from "../registry/registry";
import { decidePromotion } from "../promotions/decision";

type ModelRunOutput = {
  output_text: string;
  output_json: object | null;
  tool_calls: string[];
  latency_ms: number;
};

function loadSuites(): EvalCase[] {
  const suitesDir = path.join(process.cwd(), "ml", "evals", "suites");
  const files = fs.readdirSync(suitesDir).filter((f) => f.endsWith(".json") && !f.endsWith(".schema.json"));
  const cases: EvalCase[] = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(suitesDir, file), "utf-8")) as EvalCase[];
    for (const item of data) {
      assertValid(validateEvalCase, item, "EvalCase");
      cases.push(item);
    }
  }
  return cases;
}

function extractJson(text: string): object | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function runModel(modelId: string, evalCase: EvalCase): Promise<ModelRunOutput> {
  const useMock = process.env.ML_EVAL_USE_MOCK === "1" || !process.env.OPENAI_API_KEY;
  if (useMock) {
    const output_json = evalCase.expected_output_json ?? null;
    const output_text = evalCase.expected_output_text ?? (output_json ? JSON.stringify(output_json) : "Need more data.");
    return {
      output_text,
      output_json,
      tool_calls: evalCase.expected_tool_calls ?? [],
      latency_ms: 1,
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const start = Date.now();
  const response = await client.chat.completions.create({
    model: modelId,
    messages: evalCase.messages as ChatCompletionMessageParam[],
  });
  const latency_ms = Date.now() - start;
  const message = response.choices[0]?.message;
  const output_text = message?.content ?? "";
  const output_json = extractJson(output_text);
  const tool_calls =
    message?.tool_calls
      ?.map((call) => {
        if ("function" in call && call.function) {
          return call.function.name;
        }
        if ("name" in call && typeof call.name === "string") {
          return call.name;
        }
        return "";
      })
      .filter((name) => name.length > 0) ?? [];
  return { output_text, output_json, tool_calls, latency_ms };
}

function gradeCase(params: {
  model_id: string;
  eval_case: EvalCase;
  output: ModelRunOutput;
}): EvalResult {
  const schema = gradeSchema({ schema_path: params.eval_case.expected_schema_path, output_json: params.output.output_json });
  const doctrine = gradeDoctrine(params.output.output_text);
  const grounded = gradeGroundedness(params.output.output_text);
  const clarity = gradeClarityArtifact(params.output.output_json, params.output.output_text);
  const toolChoice = gradeToolChoice({
    expected_tools: params.eval_case.expected_tool_calls,
    actual_tools: params.output.tool_calls,
  });

  const refusalOk = params.eval_case.expected_refusal
    ? params.output.output_text.toLowerCase().includes("need") ||
      params.output.output_text.toLowerCase().includes("insufficient") ||
      params.output.output_text.toLowerCase().includes("more data")
    : true;

  const errors = [
    ...schema.errors,
    ...doctrine.errors,
    ...grounded.errors,
    ...clarity.errors,
    ...toolChoice.errors,
    ...(refusalOk ? [] : ["refusal_expected"]),
  ];

  const result: EvalResult = {
    id: params.eval_case.id,
    suite: params.eval_case.suite,
    model_id: params.model_id,
    scores: {
      schema_valid: schema.ok ? 1 : 0,
      doctrine_score: doctrine.score,
      groundedness_score: grounded.score,
      clarity_score: clarity.score,
    },
    pass: errors.length === 0,
    errors,
    latency_ms: params.output.latency_ms,
    output_json: params.output.output_json,
    output_text: params.output.output_text,
  };

  assertValid(validateEvalResult, result, "EvalResult");
  return result;
}

function aggregate(results: EvalResult[]) {
  if (results.length === 0) {
    return {
      schema_valid_rate: 0,
      doctrine_avg: 0,
      groundedness_avg: 0,
      clarity_avg: 0,
      pass_rate: 0,
    };
  }
  const sum = results.reduce(
    (acc, r) => ({
      schema: acc.schema + r.scores.schema_valid,
      doctrine: acc.doctrine + r.scores.doctrine_score,
      grounded: acc.grounded + r.scores.groundedness_score,
      clarity: acc.clarity + r.scores.clarity_score,
      pass: acc.pass + (r.pass ? 1 : 0),
    }),
    { schema: 0, doctrine: 0, grounded: 0, clarity: 0, pass: 0 }
  );
  return {
    schema_valid_rate: sum.schema / results.length,
    doctrine_avg: sum.doctrine / results.length,
    groundedness_avg: sum.grounded / results.length,
    clarity_avg: sum.clarity / results.length,
    pass_rate: sum.pass / results.length,
  };
}

export async function runEval(candidateId?: string, championId?: string) {
  const registry = loadRegistry();
  const candidate = candidateId ?? registry.candidate_model_id ?? registry.champion_model_id;
  const champion = championId ?? registry.champion_model_id;
  if (!candidate || !champion) {
    throw new Error("Missing candidate or champion model id.");
  }

  const cases = loadSuites();
  const resultsCandidate: EvalResult[] = [];
  const resultsChampion: EvalResult[] = [];

  for (const evalCase of cases) {
    const outputCandidate = await runModel(candidate, evalCase);
    resultsCandidate.push(gradeCase({ model_id: candidate, eval_case: evalCase, output: outputCandidate }));

    const outputChampion = await runModel(champion, evalCase);
    resultsChampion.push(gradeCase({ model_id: champion, eval_case: evalCase, output: outputChampion }));
  }

  const candidateMetrics = aggregate(resultsCandidate);
  const championMetrics = aggregate(resultsChampion);

  const decision = decidePromotion({ candidateMetrics, championMetrics });

  const reportDir = path.join(process.cwd(), "ml", "evals", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(reportDir, `${stamp}_candidate_vs_champion`);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify({ candidate, champion, candidateMetrics, championMetrics, decision, resultsCandidate, resultsChampion }, null, 2)
  );

  const markdown = [
    "# Eval Report",
    "",
    `Candidate: ${candidate}`,
    `Champion: ${champion}`,
    "",
    "## Metrics",
    `- Candidate schema_valid_rate: ${candidateMetrics.schema_valid_rate.toFixed(3)}`,
    `- Champion schema_valid_rate: ${championMetrics.schema_valid_rate.toFixed(3)}`,
    `- Candidate doctrine_avg: ${candidateMetrics.doctrine_avg.toFixed(3)}`,
    `- Champion doctrine_avg: ${championMetrics.doctrine_avg.toFixed(3)}`,
    `- Candidate groundedness_avg: ${candidateMetrics.groundedness_avg.toFixed(3)}`,
    `- Champion groundedness_avg: ${championMetrics.groundedness_avg.toFixed(3)}`,
    `- Candidate clarity_avg: ${candidateMetrics.clarity_avg.toFixed(3)}`,
    `- Champion clarity_avg: ${championMetrics.clarity_avg.toFixed(3)}`,
    "",
    `## Decision: ${decision.pass ? "PASS" : "FAIL"}`,
    ...decision.reasons.map((r) => `- ${r}`),
  ].join("\n");

  fs.writeFileSync(`${base}.md`, markdown);

  return {
    report_json: `${base}.json`,
    report_md: `${base}.md`,
    decision,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const candidateArg = args[0];
  const championArg = args[1];
  runEval(candidateArg, championArg)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.decision.pass) process.exit(1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
