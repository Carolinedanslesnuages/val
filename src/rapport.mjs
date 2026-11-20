/** Regroupement des usages et mise en forme du rapport, en français. */
import { empreinte, EQUIVALENTS, HYPOTHESES_MODELES, famille, G_CO2_PAR_KWH } from './methode.mjs';

const pad = (n) => String(n).padStart(2, '0');
/** Date locale AAAA-MM-JJ. */
export const jourLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Lundi de la semaine (date locale), pour regrouper par semaine. */
export function semaineLocale(d) {
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  return `semaine du ${jourLocal(lundi)}`;
}

const CLES = {
  jour: (u) => jourLocal(u.date),
  semaine: (u) => semaineLocale(u.date),
  projet: (u) => u.projet,
  modele: (u) => u.modele,
};

/** Regroupe les usages par jour, semaine, projet ou modèle, et calcule l'empreinte de chaque groupe. */
export function regrouper(usages, par = 'jour') {
  const cle = CLES[par];
  if (!cle) throw new Error(`Regroupement inconnu : « ${par} » (jour, semaine, projet ou modele).`);
  const groupes = new Map();
  for (const u of usages) {
    const k = cle(u);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(u);
  }
  const lignes = [...groupes.entries()].map(([nom, liste]) => ({ nom, reponses: liste.length, ...empreinte(liste) }));
  if (par === 'jour' || par === 'semaine') lignes.sort((a, b) => a.nom.localeCompare(b.nom));
  else lignes.sort((a, b) => b.co2g.max - a.co2g.max);
  return { lignes, total: { reponses: usages.length, ...empreinte(usages) } };
}

const fr = (n, decimales = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** « 12 – 34 g » ou « 1,2 – 3,4 kg ». */
export function fourchetteCo2(f) {
  if (f.max >= 1000) return `${fr(f.min / 1000, 1)} – ${fr(f.max / 1000, 1)} kg`;
  const d = f.max < 10 ? 1 : 0;
  return `${fr(f.min, d)} – ${fr(f.max, d)} g`;
}
export function fourchetteEnergie(f) {
  if (f.max >= 1000) return `${fr(f.min / 1000, 2)} – ${fr(f.max / 1000, 2)} kWh`;
  const d = f.max < 10 ? 1 : 0;
  return `${fr(f.min, d)} – ${fr(f.max, d)} Wh`;
}
const tokens = (n) => (n >= 1e9 ? `${fr(n / 1e9, 1)} Md` : n >= 1e6 ? `${fr(n / 1e6, 1)} M` : n >= 1e3 ? `${fr(n / 1e3, n < 1e4 ? 1 : 0)} k` : fr(n));

/** Équivalents ADEME, en fourchette. */
export function equivalents(co2g) {
  // Une décimale seulement pour les petites valeurs : « 0,4 à 1,2 km », mais « 210 à 490 km ».
  // Les équivalents trop petits pour être parlants (moins de 0,01) sont omis.
  const entre = (diviseur, unite) => {
    const max = co2g.max / diviseur;
    if (max < 0.01) return null;
    const d = max < 1 ? 2 : max < 10 ? 1 : 0;
    return `${fr(co2g.min / diviseur, d)} à ${fr(max, d)} ${unite}`;
  };
  return [
    entre(EQUIVALENTS.voitureKmG, 'km en voiture thermique'),
    entre(EQUIVALENTS.streamingHeureG, 'h de streaming vidéo'),
    entre(EQUIVALENTS.rechercheWebG, 'recherches web'),
  ].filter(Boolean);
}

function tableau(entetes, lignes) {
  const largeurs = entetes.map((e, i) => Math.max(e.length, ...lignes.map((l) => l[i].length)));
  const ligne = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(largeurs[i]) : c.padStart(largeurs[i]))).join('   ');
  return [ligne(entetes), largeurs.map((l) => '─'.repeat(l)).join('   '), ...lignes.map(ligne)].join('\n');
}

const TITRES = { jour: 'Jour', semaine: 'Semaine', projet: 'Projet', modele: 'Modèle' };

/** Rapport texte complet. */
export function rapportTexte({ lignes, total }, { par, periode, nbFichiers }) {
  const sortie = [];
  sortie.push(`Val · empreinte carbone de votre usage de Claude Code`);
  sortie.push(`${periode} · ${fr(total.reponses)} réponse${total.reponses > 1 ? 's' : ''} dans ${fr(nbFichiers)} journa${nbFichiers > 1 ? 'ux' : 'l'}`);
  sortie.push('');
  if (!lignes.length) {
    sortie.push('Aucune réponse de Claude sur cette période.');
    return sortie.join('\n');
  }
  const court = (nom) => (nom.length > 40 ? '…' + nom.slice(-39) : nom);
  const corps = lignes.map((l) => [court(l.nom), fr(l.reponses), tokens(l.tokensSortie), fourchetteEnergie(l.energieWh), fourchetteCo2(l.co2g)]);
  corps.push(['Total', fr(total.reponses), tokens(total.tokensSortie), fourchetteEnergie(total.energieWh), fourchetteCo2(total.co2g)]);
  sortie.push(tableau([TITRES[par], 'Réponses', 'Tokens produits', 'Énergie', 'CO2e'], corps));
  sortie.push('');
  sortie.push(`Soit environ : ${equivalents(total.co2g).join(' · ')}.`);
  sortie.push('');
  sortie.push('À savoir :');
  sortie.push('· Fourchette selon la méthode EcoLogits (ADEME). Anthropic ne publie pas la taille de ses');
  sortie.push('  modèles : les tailles utilisées sont des hypothèses (val --methode pour le détail).');
  sortie.push(`· Seuls les tokens produits comptent (${tokens(total.tokensSortie)}). Les ${tokens(total.tokensEntree)} tokens lus (contexte, cache) ne sont`);
  sortie.push('  pas comptés : pour un agent qui relit beaucoup, le vrai chiffre est plus haut.');
  sortie.push("· Ni l'entraînement des modèles ni votre ordinateur ne sont comptés.");
  return sortie.join('\n');
}

/** Détail de la méthode et des hypothèses. */
export function texteMethode() {
  const familles = Object.entries(HYPOTHESES_MODELES).map(([nom, h]) => `  ${nom.padEnd(7)} ${fr(h.totalMilliards)} milliards de paramètres, ${fr(h.actifsMilliards.min)} à ${fr(h.actifsMilliards.max)} actifs par token (${h.source})`);
  return [
    'Méthode : EcoLogits (GenAI Impact), https://ecologits.ai/latest/methodology/llm_inference/',
    "Données de l'ADEME (Base Empreinte), équivalents Impact CO2 : https://impactco2.fr",
    '',
    'Tailles supposées des modèles (la fourchette vient de ces bornes et du PUE 1,09 à 1,14) :',
    ...familles,
    `  Un modèle inconnu (ex. ${famille('claude-fable-5') === 'opus' ? 'Fable' : '?'}) prend la taille d'Opus, la plus prudente.`,
    '',
    `Électricité : ${G_CO2_PAR_KWH} g CO2e/kWh (États-Unis, Ember 2024). Fabrication des serveurs et GPU comprise.`,
    "Non compté : tokens lus, entraînement des modèles, réseau, ordinateur de l'utilisatrice ou de l'utilisateur.",
  ].join('\n');
}
