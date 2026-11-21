import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { footprint, modelFamily } from '../src/method.mjs';
import { logFiles, readUsages, usageFromLine, projectName } from '../src/logs.mjs';
import { groupUsages, localWeek } from '../src/report.mjs';

const TEST_FOLDER = dirname(fileURLToPath(import.meta.url));
const LOGS = join(TEST_FOLDER, 'logs');
const runCli = (...args) => execFileSync(process.execPath, [join(TEST_FOLDER, '..', 'bin', 'val.mjs'), '--dossier', LOGS, ...args], {
  encoding: 'utf8',
  env: { ...process.env, TZ: 'Europe/Paris' },
});
const allUsages = async () => readUsages(await logFiles(LOGS));

test('famille des modèles : un modèle inconnu prend la taille la plus prudente', () => {
  assert.equal(modelFamily('claude-haiku-5-5'), 'haiku');
  assert.equal(modelFamily('claude-sonnet-5-5'), 'sonnet');
  assert.equal(modelFamily('claude-opus-5-5'), 'opus');
  assert.equal(modelFamily('claude-fable-5-2'), 'opus');
});

test("l'empreinte est une fourchette, proportionnelle aux tokens produits", () => {
  const single = footprint([{ model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 1000 }]);
  const double = footprint([{ model: 'claude-opus-5-5', inputTokens: 999999, outputTokens: 2000 }]);
  assert.ok(single.co2Grams.min > 0 && single.co2Grams.min < single.co2Grams.max);
  assert.ok(Math.abs(double.co2Grams.max / single.co2Grams.max - 2) < 1e-9, 'deux fois plus de tokens produits = deux fois plus');
  assert.equal(double.inputTokens, 999999, 'les tokens lus sont comptés à part, sans effet sur le CO2');
});

test('Haiku pèse moins que Opus pour les mêmes tokens', () => {
  const haiku = footprint([{ model: 'haiku', inputTokens: 0, outputTokens: 1000 }]);
  const opus = footprint([{ model: 'opus', inputTokens: 0, outputTokens: 1000 }]);
  assert.ok(haiku.co2Grams.max < opus.co2Grams.min);
});

test("une ligne sans usage, cassée ou d'utilisateur est ignorée", () => {
  assert.equal(usageFromLine('{"type":"user","message":{"content":"x"}}'), null);
  assert.equal(usageFromLine('ligne cassée { "assistant" "usage"'), null);
  assert.equal(usageFromLine(''), null);
});

test('les réponses écrites sur plusieurs lignes ne sont comptées qu’une fois', async () => {
  const opus = (await allUsages()).filter((usage) => usage.model === 'claude-opus-5-5');
  assert.equal(opus.length, 1);
  assert.equal(opus[0].outputTokens, 200);
  assert.equal(opus[0].inputTokens, 1510);
});

test('les messages <synthetic> de Claude Code sont exclus', async () => {
  const usages = await allUsages();
  assert.equal(usages.length, 3);
  assert.ok(!usages.some((usage) => usage.model === '<synthetic>'));
});

test('la période filtre les réponses', async () => {
  const usages = await readUsages(await logFiles(LOGS), { since: new Date('2026-11-19T00:00:00Z') });
  assert.deepEqual(usages.map((usage) => usage.model), ['claude-sonnet-5-5']);
});

test('regroupement par projet et par semaine', async () => {
  const usages = await allUsages();
  const byProject = groupUsages(usages, 'projet');
  assert.deepEqual(byProject.rows.map((groupRow) => groupRow.name).sort(), ['/Users/x/projet-a', '/Users/x/projet-b']);
  assert.equal(byProject.total.answers, 3);
  assert.equal(localWeek(new Date(2026, 10, 20)), 'semaine du 2026-11-16');
  assert.throws(() => groupUsages(usages, 'couleur'), /Regroupement inconnu/);
});

test('rapport texte complet, sans aucun contenu des échanges', () => {
  const output = runCli('--depuis', '2026-11-01', '--jusqua', '2026-11-30');
  assert.match(output, /Du 2026-11-01 au 2026-11-30 · 3 réponses/);
  assert.match(output, /2026-11-18/);
  assert.match(output, /Total/);
  assert.match(output, /km en voiture thermique/);
  assert.match(output, /hypothèses/);
  assert.doesNotMatch(output, /PRIVÉ|privée/);
});

test('sortie JSON : format public inchangé', () => {
  const report = JSON.parse(runCli('--depuis', '2026-11-01', '--par', 'modèle', '--json'));
  assert.deepEqual(Object.keys(report), ['periode', 'par', 'journaux', 'lignes', 'total']);
  assert.deepEqual(Object.keys(report.lignes[0]), ['nom', 'reponses', 'energieWh', 'co2g', 'tokensSortie', 'tokensEntree']);
  assert.equal(report.par, 'modele');
  assert.equal(report.total.reponses, 3);
  assert.equal(report.total.tokensSortie, 1500);
  assert.equal(report.lignes.length, 3);
});

test('une option inconnue ou une date invalide donne une erreur claire', () => {
  assert.throws(() => runCli('--nimporte'), /Option inconnue/);
  assert.throws(() => runCli('--depuis', '18/11/2026'), /AAAA-MM-JJ/);
});

test('période sans réponse', () => {
  assert.match(runCli('--depuis', '2020-01-01', '--jusqua', '2020-01-31'), /Aucune réponse de Claude sur cette période/);
});

test('nom de projet : chemin depuis le dossier personnel', () => {
  assert.equal(projectName(homedir()), '~');
  assert.equal(projectName(join(homedir(), 'projets', 'boutique', 'api')), '~/projets/boutique/api');
  assert.equal(projectName('/srv/autre'), '/srv/autre');
  assert.equal(projectName(undefined), '(inconnu)');
});
