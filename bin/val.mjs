#!/usr/bin/env node
/** Val: carbon footprint of your Claude Code usage, from its local logs. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logFiles, readUsages } from '../src/logs.mjs';
import { groupUsages, textReport, jsonReport, methodText, localDay } from '../src/report.mjs';

const HELP = `Val · empreinte carbone de votre usage de Claude Code

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

const ONE_DAY_MS = 86400000;

function parseOptions(args) {
  const options = { days: 7, groupBy: 'jour', folder: join(homedir(), '.claude', 'projects') };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const nextValue = () => {
      const value = args[++index];
      if (value === undefined) throw new Error(`L'option ${argument} attend une valeur.`);
      return value;
    };
    if (argument === '--aide' || argument === '-h' || argument === '--help') options.help = true;
    else if (argument === '--methode') options.method = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--tout') options.everything = true;
    else if (argument === '--jours') options.days = Number(nextValue());
    else if (argument === '--depuis') options.since = nextValue();
    else if (argument === '--jusqua') options.until = nextValue();
    else if (argument === '--par') options.groupBy = nextValue().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    else if (argument === '--dossier') options.folder = nextValue();
    else throw new Error(`Option inconnue : ${argument}. Tapez « val --aide ».`);
  }
  if (!Number.isInteger(options.days) || options.days < 1) throw new Error('--jours attend un nombre entier positif.');
  return options;
}

function parseLocalDate(text, optionName) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`${optionName} attend une date AAAA-MM-JJ, par exemple 2026-11-01.`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) return console.log(HELP);
  if (options.method) return console.log(methodText());

  let since;
  let until;
  if (options.since) since = parseLocalDate(options.since, '--depuis');
  else if (!options.everything) {
    const today = new Date();
    since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (options.days - 1));
  }
  if (options.until) {
    until = parseLocalDate(options.until, '--jusqua');
    until.setDate(until.getDate() + 1); // the end date is included
  }

  const files = await logFiles(options.folder, since);
  const grouped = groupUsages(await readUsages(files, { since, until }), options.groupBy);
  const lastDay = until ? new Date(until.getTime() - ONE_DAY_MS) : new Date();
  const period = since ? `Du ${localDay(since)} au ${localDay(lastDay)}` : `Tout l'historique jusqu'au ${localDay(lastDay)}`;
  const context = { groupBy: options.groupBy, period, logCount: files.length };

  if (options.json) return console.log(JSON.stringify(jsonReport(grouped, context), null, 2));
  console.log(textReport(grouped, context));
}

main().catch((error) => {
  console.error(`val : ${error.message}`);
  process.exit(1);
});
