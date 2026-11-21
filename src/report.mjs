/** Groups usages and formats the report, in French. */
import { footprint, EQUIVALENTS, MODEL_ASSUMPTIONS, modelFamily, GRAMS_CO2_PER_KWH } from './method.mjs';

const twoDigits = (number) => String(number).padStart(2, '0');

/** Local date YYYY-MM-DD. */
export const localDay = (date) => `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

/** Monday of the week (local date), to group by week. */
export function localWeek(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `semaine du ${localDay(monday)}`;
}

/** Grouping keys, by the --par value (public, in French). */
const GROUP_KEYS = {
  jour: (usage) => localDay(usage.date),
  semaine: (usage) => localWeek(usage.date),
  projet: (usage) => usage.project,
  modele: (usage) => usage.model,
};

/** Groups usages by day, week, project or model, and computes each group's footprint. */
export function groupUsages(usages, groupBy = 'jour') {
  const keyOf = GROUP_KEYS[groupBy];
  if (!keyOf) throw new Error(`Regroupement inconnu : « ${groupBy} » (jour, semaine, projet ou modele).`);
  const groups = new Map();
  for (const usage of usages) {
    const groupKey = keyOf(usage);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(usage);
  }
  const rows = [...groups.entries()].map(([name, members]) => ({ name, answers: members.length, ...footprint(members) }));
  if (groupBy === 'jour' || groupBy === 'semaine') rows.sort((left, right) => left.name.localeCompare(right.name));
  else rows.sort((left, right) => right.co2Grams.max - left.co2Grams.max);
  return { rows, total: { answers: usages.length, ...footprint(usages) } };
}

/** The --json output, with its public French keys. */
export function jsonReport({ rows, total }, { period, groupBy, logCount }) {
  const toJson = (entry) => ({
    reponses: entry.answers,
    energieWh: entry.energyWh,
    co2g: entry.co2Grams,
    tokensSortie: entry.outputTokens,
    tokensEntree: entry.inputTokens,
  });
  return {
    periode: period,
    par: groupBy,
    journaux: logCount,
    lignes: rows.map((groupRow) => ({ nom: groupRow.name, ...toJson(groupRow) })),
    total: toJson(total),
  };
}

const french = (number, decimals = 0) => number.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** "12 – 34 g" or "1,2 – 3,4 kg". */
export function co2Range(range) {
  if (range.max >= 1000) return `${french(range.min / 1000, 1)} – ${french(range.max / 1000, 1)} kg`;
  const decimals = range.max < 10 ? 1 : 0;
  return `${french(range.min, decimals)} – ${french(range.max, decimals)} g`;
}

export function energyRange(range) {
  if (range.max >= 1000) return `${french(range.min / 1000, 2)} – ${french(range.max / 1000, 2)} kWh`;
  const decimals = range.max < 10 ? 1 : 0;
  return `${french(range.min, decimals)} – ${french(range.max, decimals)} Wh`;
}

function tokenCount(count) {
  if (count >= 1e9) return `${french(count / 1e9, 1)} Md`;
  if (count >= 1e6) return `${french(count / 1e6, 1)} M`;
  if (count >= 1e3) return `${french(count / 1e3, count < 1e4 ? 1 : 0)} k`;
  return french(count);
}

/** ADEME equivalents, as a range. */
export function equivalents(co2Grams) {
  // One decimal only for small values: "0,4 à 1,2 km", but "210 à 490 km".
  // Equivalents too small to mean anything (below 0.01) are left out.
  const between = (divisor, unit) => {
    const maximum = co2Grams.max / divisor;
    if (maximum < 0.01) return null;
    const decimals = maximum < 1 ? 2 : maximum < 10 ? 1 : 0;
    return `${french(co2Grams.min / divisor, decimals)} à ${french(maximum, decimals)} ${unit}`;
  };
  return [
    between(EQUIVALENTS.carKilometerGrams, 'km en voiture thermique'),
    between(EQUIVALENTS.streamingHourGrams, 'h de streaming vidéo'),
    between(EQUIVALENTS.webSearchGrams, 'recherches web'),
  ].filter(Boolean);
}

function table(headers, rows) {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((cells) => cells[column].length)));
  const formatRow = (cells) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join('   ');
  return [formatRow(headers), widths.map((width) => '─'.repeat(width)).join('   '), ...rows.map(formatRow)].join('\n');
}

const COLUMN_TITLES = { jour: 'Jour', semaine: 'Semaine', projet: 'Projet', modele: 'Modèle' };

/** Full text report. */
export function textReport({ rows, total }, { groupBy, period, logCount }) {
  const output = [];
  output.push('Val · empreinte carbone de votre usage de Claude Code');
  output.push(`${period} · ${french(total.answers)} réponse${total.answers > 1 ? 's' : ''} dans ${french(logCount)} journa${logCount > 1 ? 'ux' : 'l'}`);
  output.push('');
  if (!rows.length) {
    output.push('Aucune réponse de Claude sur cette période.');
    return output.join('\n');
  }
  const shorten = (name) => (name.length > 40 ? '…' + name.slice(-39) : name);
  const cells = rows.map((groupRow) => [shorten(groupRow.name), french(groupRow.answers), tokenCount(groupRow.outputTokens), energyRange(groupRow.energyWh), co2Range(groupRow.co2Grams)]);
  cells.push(['Total', french(total.answers), tokenCount(total.outputTokens), energyRange(total.energyWh), co2Range(total.co2Grams)]);
  output.push(table([COLUMN_TITLES[groupBy], 'Réponses', 'Tokens produits', 'Énergie', 'CO2e'], cells));
  output.push('');
  output.push(`Soit environ : ${equivalents(total.co2Grams).join(' · ')}.`);
  output.push('');
  output.push('À savoir :');
  output.push('· Fourchette selon la méthode EcoLogits (ADEME). Anthropic ne publie pas la taille de ses');
  output.push('  modèles : les tailles utilisées sont des hypothèses (val --methode pour le détail).');
  output.push(`· Seuls les tokens produits comptent (${tokenCount(total.outputTokens)}). Les ${tokenCount(total.inputTokens)} tokens lus (contexte, cache) ne sont`);
  output.push('  pas comptés : pour un agent qui relit beaucoup, le vrai chiffre est plus haut.');
  output.push("· Ni l'entraînement des modèles ni votre ordinateur ne sont comptés.");
  return output.join('\n');
}

/** Details of the method and its assumptions. */
export function methodText() {
  const families = Object.entries(MODEL_ASSUMPTIONS).map(([name, assumption]) => {
    const active = `${french(assumption.activeBillions.min)} à ${french(assumption.activeBillions.max)}`;
    return `  ${name.padEnd(7)} ${french(assumption.totalBillions)} milliards de paramètres, ${active} actifs par token (${assumption.source})`;
  });
  return [
    'Méthode : EcoLogits (GenAI Impact), https://ecologits.ai/latest/methodology/llm_inference/',
    "Données de l'ADEME (Base Empreinte), équivalents Impact CO2 : https://impactco2.fr",
    '',
    'Tailles supposées des modèles (la fourchette vient de ces bornes et du PUE 1,09 à 1,14) :',
    ...families,
    `  Un modèle inconnu (ex. ${modelFamily('claude-fable-5') === 'opus' ? 'Fable' : '?'}) prend la taille d'Opus, la plus prudente.`,
    '',
    `Électricité : ${GRAMS_CO2_PER_KWH} g CO2e/kWh (États-Unis, Ember 2024). Fabrication des serveurs et GPU comprise.`,
    "Non compté : tokens lus, entraînement des modèles, réseau, ordinateur de l'utilisatrice ou de l'utilisateur.",
  ].join('\n');
}
