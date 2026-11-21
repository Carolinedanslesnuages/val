/**
 * Carbon footprint of model inference, estimated as a RANGE.
 *
 * Method: EcoLogits (GenAI Impact), an open life cycle assessment method built on ADEME's
 * Base Empreinte: https://ecologits.ai/latest/methodology/llm_inference/
 * Equivalents: Impact CO2 (ADEME), https://impactco2.fr (values checked on 2026-11-19).
 *
 * Limits, to show alongside the figure:
 * - Anthropic publishes neither the size of its models nor their consumption: the sizes below are
 *   ASSUMPTIONS (EcoLogits' estimate for Claude 3 Opus), to replace once known;
 * - like EcoLogits, only PRODUCED tokens count; reading (context, cache) is not counted: this is a
 *   lower bound for an agent that rereads a lot;
 * - model training and the user's computer are not counted.
 */

/** Assumed sizes of the Claude families (billions of parameters). */
export const MODEL_ASSUMPTIONS = {
  opus: { totalBillions: 2000, activeBillions: { min: 200, max: 600 }, source: 'EcoLogits, estimation pour Claude 3 Opus' },
  sonnet: { totalBillions: 1000, activeBillions: { min: 100, max: 300 }, source: "hypothèse (moitié d'Opus)" },
  haiku: { totalBillions: 300, activeBillions: { min: 30, max: 90 }, source: 'hypothèse' },
};

/** EcoLogits constants ("LLM inference" methodology). */
const ECOLOGITS = {
  alpha: 1.17e-6,
  beta: -1.12e-2,
  gamma: 4.05e-5,
  batchSize: 64,
  serverPowerWithoutGpuWatts: 1200,
  gpusPerServer: 8,
  gpuMemoryGigabytes: 80,
  memoryOverhead: 1.2,
  bytesPerParameter: 2,
  /** PUE of the data centers Anthropic uses (AWS, Google), according to EcoLogits. */
  powerUsageEffectiveness: { min: 1.09, max: 1.14 },
  /** Manufacturing: server without GPU (kg CO2e), H100 GPU, lifetime (years). */
  serverManufacturingKg: 5700,
  gpuManufacturingKg: 273,
  lifetimeYears: 3,
};

/** Assumption: generation speed, for how long servers are busy. */
const TOKENS_PER_SECOND = 40;

/** Electricity in the United States (Anthropic's data centers): Ember 2024, via Our World in Data. */
export const GRAMS_CO2_PER_KWH = 384;

/** ADEME equivalents (Impact CO2, full life cycle), in g CO2e. */
export const EQUIVALENTS = {
  streamingHourGrams: 64,
  carKilometerGrams: 142.25,
  webSearchGrams: 1.23,
};

/** Assumed family of a model. An unknown model takes the largest size (the most cautious). */
export function modelFamily(model) {
  const name = String(model).toLowerCase();
  if (name.includes('haiku')) return 'haiku';
  if (name.includes('sonnet')) return 'sonnet';
  return 'opus';
}

function gpuCount(totalBillions) {
  const memoryGigabytes = ECOLOGITS.memoryOverhead * totalBillions * ECOLOGITS.bytesPerParameter;
  const required = Math.ceil(memoryGigabytes / ECOLOGITS.gpuMemoryGigabytes);
  return 2 ** Math.ceil(Math.log2(Math.max(1, required)));
}

/** Energy (Wh) and CO2e (g) for produced tokens, with a given active size and PUE. */
function compute(outputTokens, assumption, activeBillions, powerUsageEffectiveness) {
  const gpus = gpuCount(assumption.totalBillions);
  const whPerTokenPerGpu = ECOLOGITS.alpha * Math.exp(ECOLOGITS.beta * ECOLOGITS.batchSize) * activeBillions + ECOLOGITS.gamma;
  const gpuEnergy = outputTokens * whPerTokenPerGpu * gpus;
  const durationHours = outputTokens / TOKENS_PER_SECOND / 3600;
  const otherEnergy = (durationHours * ECOLOGITS.serverPowerWithoutGpuWatts * (gpus / ECOLOGITS.gpusPerServer)) / ECOLOGITS.batchSize;
  const energyWh = powerUsageEffectiveness * (gpuEnergy + otherEnergy);
  const manufacturingKg = (gpus / ECOLOGITS.gpusPerServer) * ECOLOGITS.serverManufacturingKg + gpus * ECOLOGITS.gpuManufacturingKg;
  const manufacturingShare = durationHours / (ECOLOGITS.batchSize * ECOLOGITS.lifetimeYears * 365 * 24);
  return { energyWh, co2Grams: (energyWh / 1000) * GRAMS_CO2_PER_KWH + manufacturingShare * manufacturingKg * 1000 };
}

/**
 * Footprint of a list of usages { model, inputTokens, outputTokens }.
 * @returns {{ energyWh: {min:number,max:number}, co2Grams: {min:number,max:number}, outputTokens: number, inputTokens: number }}
 */
export function footprint(usages) {
  const total = { energyWh: { min: 0, max: 0 }, co2Grams: { min: 0, max: 0 }, outputTokens: 0, inputTokens: 0 };
  for (const usage of usages) {
    const assumption = MODEL_ASSUMPTIONS[modelFamily(usage.model)];
    const lowEstimate = compute(usage.outputTokens, assumption, assumption.activeBillions.min, ECOLOGITS.powerUsageEffectiveness.min);
    const highEstimate = compute(usage.outputTokens, assumption, assumption.activeBillions.max, ECOLOGITS.powerUsageEffectiveness.max);
    total.energyWh.min += lowEstimate.energyWh;
    total.energyWh.max += highEstimate.energyWh;
    total.co2Grams.min += lowEstimate.co2Grams;
    total.co2Grams.max += highEstimate.co2Grams;
    total.outputTokens += usage.outputTokens;
    total.inputTokens += usage.inputTokens;
  }
  return total;
}
