#!/usr/bin/env node
/** Val : empreinte carbone de votre usage de Claude Code, à partir de ses journaux locaux. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fichiersJournaux, lireUsages } from '../src/journaux.mjs';
import { regrouper, rapportTexte, texteMethode, jourLocal } from '../src/rapport.mjs';

const AIDE = `Val · empreinte carbone de votre usage de Claude Code

Usage : val [options]

  --jours <n>        les n derniers jours (défaut : 7)
  --depuis <date>    depuis une date (AAAA-MM-JJ), au lieu de --jours
  --jusqua <date>    jusqu'à une date incluse (AAAA-MM-JJ)
  --tout             tout l'historique disponible
  --par <critère>    jour (défaut), semaine, projet ou modele
  --json             résultat en JSON (pour un tableau de bord, un script…)
  --dossier <chemin> dossier des journaux (défaut : ~/.claude/projects)
  --methode          affiche la méthode et les hypothèses
  --aide             cette aide

Seuls les compteurs de tokens sont lus. Le contenu des échanges n'est jamais lu ni envoyé.`;

function lireOptions(args) {
  const o = { jours: 7, par: 'jour', dossier: join(homedir(), '.claude', 'projects') };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const valeur = () => {
      const v = args[++i];
      if (v === undefined) throw new Error(`L'option ${a} attend une valeur.`);
      return v;
    };
    if (a === '--aide' || a === '-h' || a === '--help') o.aide = true;
    else if (a === '--methode') o.methode = true;
    else if (a === '--json') o.json = true;
    else if (a === '--tout') o.tout = true;
    else if (a === '--jours') o.jours = Number(valeur());
    else if (a === '--depuis') o.depuis = valeur();
    else if (a === '--jusqua') o.jusqua = valeur();
    else if (a === '--par') o.par = valeur().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    else if (a === '--dossier') o.dossier = valeur();
    else throw new Error(`Option inconnue : ${a}. Tapez « val --aide ».`);
  }
  if (!Number.isInteger(o.jours) || o.jours < 1) throw new Error('--jours attend un nombre entier positif.');
  return o;
}

function dateLocale(texte, option) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!m) throw new Error(`${option} attend une date AAAA-MM-JJ, par exemple 2026-11-01.`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

async function principal() {
  const o = lireOptions(process.argv.slice(2));
  if (o.aide) return console.log(AIDE);
  if (o.methode) return console.log(texteMethode());

  let depuis;
  let jusqua;
  if (o.depuis) depuis = dateLocale(o.depuis, '--depuis');
  else if (!o.tout) {
    const aujourdhui = new Date();
    depuis = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() - (o.jours - 1));
  }
  if (o.jusqua) {
    jusqua = dateLocale(o.jusqua, '--jusqua');
    jusqua.setDate(jusqua.getDate() + 1); // date incluse
  }

  const fichiers = await fichiersJournaux(o.dossier, depuis);
  const usages = await lireUsages(fichiers, { depuis, jusqua });
  const resultat = regrouper(usages, o.par);
  const fin = jusqua ? new Date(jusqua.getTime() - 86400000) : new Date();
  const periode = depuis ? `Du ${jourLocal(depuis)} au ${jourLocal(fin)}` : `Tout l'historique jusqu'au ${jourLocal(fin)}`;

  if (o.json) return console.log(JSON.stringify({ periode, par: o.par, journaux: fichiers.length, ...resultat }, null, 2));
  console.log(rapportTexte(resultat, { par: o.par, periode, nbFichiers: fichiers.length }));
}

principal().catch((e) => {
  console.error(`val : ${e.message}`);
  process.exit(1);
});
