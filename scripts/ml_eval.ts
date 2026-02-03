import minimist from "minimist";
import { runEval } from "../ml/evals/eval_runner";

async function run() {
  const args = minimist(process.argv.slice(2));
  const candidate = args.candidate ?? args.c;
  const champion = args.champion ?? args.ch;
  const ciMode = args.ci === true;

  const result = await runEval(candidate, champion);
  console.log(JSON.stringify(result, null, 2));

  if (!result.decision.pass && (ciMode || process.env.ML_EVAL_FAIL_ON_FAIL === "1")) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
