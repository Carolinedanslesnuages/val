/**
 * Empreinte carbone de l'inférence des modèles, estimée en FOURCHETTE.
 *
 * Méthode : EcoLogits (GenAI Impact), méthode ouverte d'analyse de cycle de vie, qui s'appuie sur la
 * Base Empreinte de l'ADEME : https://ecologits.ai/latest/methodology/llm_inference/
 * Équivalents : Impact CO2 (ADEME), https://impactco2.fr (valeurs relues le 2026-11-19).
 *
 * Limites, à afficher avec le chiffre :
 * - Anthropic ne publie ni la taille de ses modèles ni leur consommation : les tailles ci-dessous
 *   sont des HYPOTHÈSES (estimation d'EcoLogits pour Claude 3 Opus), à remplacer quand on saura ;
 * - comme EcoLogits, seuls les tokens PRODUITS comptent ; la lecture (contexte, cache) n'est pas
 *   comptée : c'est une borne basse pour un agent qui relit beaucoup ;
 * - l'entraînement des modèles et le poste de travail ne sont pas comptés.
 */

/** Tailles supposées des familles Claude (milliards de paramètres). */
export const HYPOTHESES_MODELES = {
  opus: { totalMilliards: 2000, actifsMilliards: { min: 200, max: 600 }, source: 'EcoLogits, estimation pour Claude 3 Opus' },
  sonnet: { totalMilliards: 1000, actifsMilliards: { min: 100, max: 300 }, source: "hypothèse (moitié d'Opus)" },
  haiku: { totalMilliards: 300, actifsMilliards: { min: 30, max: 90 }, source: 'hypothèse' },
};

/** Constantes d'EcoLogits (méthodologie « LLM inference »). */
const ECOLOGITS = {
  alpha: 1.17e-6,
  beta: -1.12e-2,
  gamma: 4.05e-5,
  batch: 64,
  puissanceServeurHorsGpuW: 1200,
  gpuParServeur: 8,
  memoireGpuGo: 80,
  surcoutMemoire: 1.2,
  octetsParParametre: 2,
  /** PUE des centres de données utilisés par Anthropic (AWS, Google), d'après EcoLogits. */
  pue: { min: 1.09, max: 1.14 },
  /** Fabrication : serveur sans GPU (kg CO2e), GPU H100, durée de vie (ans). */
  fabricationServeurKg: 5700,
  fabricationGpuKg: 273,
  dureeVieAns: 3,
};

/** Hypothèse : débit de génération, pour la durée d'occupation des serveurs. */
const TOKENS_PAR_SECONDE = 40;

/** Électricité aux États-Unis (centres de données d'Anthropic) : Ember 2024, via Our World in Data. */
export const G_CO2_PAR_KWH = 384;

/** Équivalents de l'ADEME (Impact CO2, cycle de vie complet), en g CO2e. */
export const EQUIVALENTS = {
  streamingHeureG: 64,
  voitureKmG: 142.25,
  rechercheWebG: 1.23,
};

/** Famille supposée d'un modèle. Un modèle inconnu prend la plus grande taille (la plus prudente). */
export function famille(modele) {
  const nom = String(modele).toLowerCase();
  if (nom.includes('haiku')) return 'haiku';
  if (nom.includes('sonnet')) return 'sonnet';
  return 'opus';
}

function nombreGpu(totalMilliards) {
  const memoireGo = ECOLOGITS.surcoutMemoire * totalMilliards * ECOLOGITS.octetsParParametre;
  const brut = Math.ceil(memoireGo / ECOLOGITS.memoireGpuGo);
  return 2 ** Math.ceil(Math.log2(Math.max(1, brut)));
}

/** Énergie (Wh) et CO2e (g) pour des tokens produits, avec une taille active et un PUE donnés. */
function calculer(tokensSortie, h, actifs, pue) {
  const gpu = nombreGpu(h.totalMilliards);
  const whParTokenParGpu = ECOLOGITS.alpha * Math.exp(ECOLOGITS.beta * ECOLOGITS.batch) * actifs + ECOLOGITS.gamma;
  const energieGpu = tokensSortie * whParTokenParGpu * gpu;
  const dureeHeures = tokensSortie / TOKENS_PAR_SECONDE / 3600;
  const energieHorsGpu = (dureeHeures * ECOLOGITS.puissanceServeurHorsGpuW * (gpu / ECOLOGITS.gpuParServeur)) / ECOLOGITS.batch;
  const wh = pue * (energieGpu + energieHorsGpu);
  const fabricationKg = (gpu / ECOLOGITS.gpuParServeur) * ECOLOGITS.fabricationServeurKg + gpu * ECOLOGITS.fabricationGpuKg;
  const partFabrication = dureeHeures / (ECOLOGITS.batch * ECOLOGITS.dureeVieAns * 365 * 24);
  return { wh, g: (wh / 1000) * G_CO2_PAR_KWH + partFabrication * fabricationKg * 1000 };
}

/**
 * Empreinte d'une liste d'usages { modele, tokensEntree, tokensSortie }.
 * @returns {{ energieWh: {min:number,max:number}, co2g: {min:number,max:number}, tokensSortie: number, tokensEntree: number }}
 */
export function empreinte(usages) {
  const total = { energieWh: { min: 0, max: 0 }, co2g: { min: 0, max: 0 }, tokensSortie: 0, tokensEntree: 0 };
  for (const usage of usages) {
    const h = HYPOTHESES_MODELES[famille(usage.modele)];
    const bas = calculer(usage.tokensSortie, h, h.actifsMilliards.min, ECOLOGITS.pue.min);
    const haut = calculer(usage.tokensSortie, h, h.actifsMilliards.max, ECOLOGITS.pue.max);
    total.energieWh.min += bas.wh;
    total.energieWh.max += haut.wh;
    total.co2g.min += bas.g;
    total.co2g.max += haut.g;
    total.tokensSortie += usage.tokensSortie;
    total.tokensEntree += usage.tokensEntree;
  }
  return total;
}
