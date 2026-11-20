/**
 * Lecture des journaux locaux de Claude Code (~/.claude/projects/**.jsonl).
 *
 * Seuls les COMPTEURS sont lus : date, dossier de travail, modèle et nombre de tokens.
 * Le contenu des échanges n'est jamais extrait ni conservé.
 *
 * Claude Code écrit une même réponse sur plusieurs lignes (une par bloc de contenu) avec le même
 * identifiant de message : on dédoublonne par identifiant, en gardant les plus grands compteurs.
 */
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const MAISON = homedir();
/** Dossier de travail lisible : « ~/projet/sous-dossier » plutôt qu'un nom seul, souvent ambigu (api, front…). */
export const nomProjet = (cwd) => (!cwd ? '(inconnu)' : cwd === MAISON ? '~' : cwd.startsWith(MAISON + '/') ? '~' + cwd.slice(MAISON.length) : cwd);

/** Tous les fichiers .jsonl d'un dossier, sous-dossiers compris, modifiés depuis `depuis`. */
export async function fichiersJournaux(dossier, depuis) {
  const trouves = [];
  async function parcourir(d) {
    let entrees;
    try {
      entrees = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const chemin = join(d, e.name);
      if (e.isDirectory()) await parcourir(chemin);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        if (depuis) {
          const { mtime } = await stat(chemin);
          if (mtime < depuis) continue; // rien de récent dedans
        }
        trouves.push(chemin);
      }
    }
  }
  await parcourir(dossier);
  return trouves.sort();
}

/** Extrait l'usage d'une ligne de journal, ou null si la ligne n'en porte pas. */
export function usageDeLigne(ligne) {
  // Filtre rapide avant d'analyser le JSON : la plupart des lignes ne sont pas des réponses.
  if (!ligne.includes('"assistant"') || !ligne.includes('"usage"')) return null;
  let d;
  try {
    d = JSON.parse(ligne);
  } catch {
    return null;
  }
  const m = d && d.message;
  if (d.type !== 'assistant' || !m || typeof m !== 'object' || !m.usage) return null;
  const u = m.usage;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    id: m.id || d.requestId || d.uuid || null,
    date: d.timestamp ? new Date(d.timestamp) : null,
    projet: nomProjet(d.cwd),
    modele: m.model || '(inconnu)',
    tokensEntree: n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens),
    tokensSortie: n(u.output_tokens),
  };
}

/**
 * Lit les journaux et renvoie les usages dédoublonnés, dans la période [depuis, jusqua[.
 * @param {string[]} fichiers
 * @param {{ depuis?: Date, jusqua?: Date }} periode
 */
export async function lireUsages(fichiers, { depuis, jusqua } = {}) {
  const parId = new Map();
  const sansId = [];
  for (const fichier of fichiers) {
    const lignes = createInterface({ input: createReadStream(fichier, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const ligne of lignes) {
      const u = usageDeLigne(ligne);
      if (!u || !u.date || Number.isNaN(u.date.getTime())) continue;
      if (depuis && u.date < depuis) continue;
      if (jusqua && u.date >= jusqua) continue;
      if (u.modele === '<synthetic>') continue; // messages produits par Claude Code, sans appel au modèle
      if (!u.id) {
        sansId.push(u);
        continue;
      }
      const deja = parId.get(u.id);
      if (!deja) parId.set(u.id, u);
      else {
        deja.tokensEntree = Math.max(deja.tokensEntree, u.tokensEntree);
        deja.tokensSortie = Math.max(deja.tokensSortie, u.tokensSortie);
      }
    }
  }
  return [...parId.values(), ...sansId];
}
