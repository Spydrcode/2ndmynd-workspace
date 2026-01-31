export type IntelligenceMode = "mock" | "live";

export type IntelligenceConfig = {
  mode: IntelligenceMode;
  seed: number;
  temperature: number;
  top_p: number;
  max_retries: number;
};

function readNumber(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function getIntelligenceConfig(): IntelligenceConfig {
  const modeRaw = (process.env.INTELLIGENCE_MODE ?? "mock").toLowerCase();
  const mode: IntelligenceMode = modeRaw === "live" ? "live" : "mock";

  return {
    mode,
    seed: readNumber(process.env.INTELLIGENCE_SEED, 1337),
    temperature: readNumber(process.env.INTELLIGENCE_TEMPERATURE, 0),
    top_p: readNumber(process.env.INTELLIGENCE_TOP_P, 0.1),
    max_retries: Math.max(0, Math.trunc(readNumber(process.env.INTELLIGENCE_MAX_RETRIES, 1))),
  };
}
