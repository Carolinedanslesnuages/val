import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { empreinte, famille } from '../src/methode.mjs';
import { fichiersJournaux, lireUsages, usageDeLigne, nomProjet } from '../src/journaux.mjs';
import { homedir } from 'node:os';
import { regrouper, semaineLocale } from '../src/rapport.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const JOURNAUX = join(ici, 'journaux');
const val = (...args) => execFileSync(process.execPath, [join(ici, '..', 'bin', 'val.mjs'), '--dossier', JOURNAUX, ...args], { encoding: 'utf8', env: { ...process.env, TZ: 'Europe/Paris' } });

test('famille des modèles : un modèle inconnu prend la taille la plus prudente', () => {
  assert.equal(famille('claude-haiku-5-5'), 'haiku');
  assert.equal(famille('claude-sonnet-5-5'), 'sonnet');
  assert.equal(famille('claude-opus-5-5'), 'opus');
  assert.equal(famille('claude-fable-5-2'), 'opus');
});

test("l'empreinte est une fourchette, proportionnelle aux tokens produits", () => {
  const un = empreinte([{ modele: 'claude-opus-5-5', tokensEntree: 0, tokensSortie: 1000 }]);
  const deux = empreinte([{ modele: 'claude-opus-5-5', tokensEntree: 999999, tokensSortie: 2000 }]);
  assert.ok(un.co2g.min > 0 && un.co2g.min < un.co2g.max);
  assert.ok(Math.abs(deux.co2g.max / un.co2g.max - 2) < 1e-9, 'deux fois plus de tokens produits = deux fois plus');
  assert.equal(deux.tokensEntree, 999999, 'les tokens lus sont comptés à part, sans effet sur le CO2');
});

test('Haiku pèse moins que Opus pour les mêmes tokens', () => {
  const h = empreinte([{ modele: 'haiku', tokensEntree: 0, tokensSortie: 1000 }]);
  const o = empreinte([{ modele: 'opus', tokensEntree: 0, tokensSortie: 1000 }]);
  assert.ok(h.co2g.max < o.co2g.min);
});

test("une ligne sans usage, cassée ou d'utilisateur est ignorée", () => {
  assert.equal(usageDeLigne('{"type":"user","message":{"content":"x"}}'), null);
  assert.equal(usageDeLigne('ligne cassée { "assistant" "usage"'), null);
  assert.equal(usageDeLigne(''), null);
});

test('les réponses écrites sur plusieurs lignes ne sont comptées qu’une fois', async () => {
  const usages = await lireUsages(await fichiersJournaux(JOURNAUX));
  const opus = usages.filter((u) => u.modele === 'claude-opus-5-5');
  assert.equal(opus.length, 1);
  assert.equal(opus[0].tokensSortie, 200);
  assert.equal(opus[0].tokensEntree, 1510);
});

test('les messages <synthetic> de Claude Code sont exclus', async () => {
  const usages = await lireUsages(await fichiersJournaux(JOURNAUX));
  assert.equal(usages.length, 3);
  assert.ok(!usages.some((u) => u.modele === '<synthetic>'));
});

test('la période filtre les réponses', async () => {
  const fichiers = await fichiersJournaux(JOURNAUX);
  const usages = await lireUsages(fichiers, { depuis: new Date('2026-11-19T00:00:00Z') });
  assert.deepEqual(usages.map((u) => u.modele), ['claude-sonnet-5-5']);
});

test('regroupement par projet et par semaine', async () => {
  const usages = await lireUsages(await fichiersJournaux(JOURNAUX));
  const parProjet = regrouper(usages, 'projet');
  assert.deepEqual(parProjet.lignes.map((l) => l.nom).sort(), ['/Users/x/projet-a', '/Users/x/projet-b']);
  assert.equal(parProjet.total.reponses, 3);
  assert.equal(semaineLocale(new Date(2026, 10, 20)), 'semaine du 2026-11-16');
  assert.throws(() => regrouper(usages, 'couleur'), /Regroupement inconnu/);
});

test('rapport texte complet, sans aucun contenu des échanges', () => {
  const sortie = val('--depuis', '2026-11-01', '--jusqua', '2026-11-30');
  assert.match(sortie, /Du 2026-11-01 au 2026-11-30 · 3 réponses/);
  assert.match(sortie, /2026-11-18/);
  assert.match(sortie, /Total/);
  assert.match(sortie, /km en voiture thermique/);
  assert.match(sortie, /hypothèses/);
  assert.doesNotMatch(sortie, /PRIVÉ|privée/);
});

test('sortie JSON', () => {
  const r = JSON.parse(val('--depuis', '2026-11-01', '--par', 'modèle', '--json'));
  assert.equal(r.par, 'modele');
  assert.equal(r.total.reponses, 3);
  assert.equal(r.total.tokensSortie, 1500);
  assert.equal(r.lignes.length, 3);
});

test('une option inconnue ou une date invalide donne une erreur claire', () => {
  assert.throws(() => val('--nimporte'), /Option inconnue/);
  assert.throws(() => val('--depuis', '18/11/2026'), /AAAA-MM-JJ/);
});

test('période sans réponse', () => {
  assert.match(val('--depuis', '2020-01-01', '--jusqua', '2020-01-31'), /Aucune réponse de Claude sur cette période/);
});

test('nom de projet : chemin depuis le dossier personnel', () => {
  assert.equal(nomProjet(homedir()), '~');
  assert.equal(nomProjet(join(homedir(), 'atelier-po', 'interface', 'api')), '~/atelier-po/interface/api');
  assert.equal(nomProjet('/srv/autre'), '/srv/autre');
  assert.equal(nomProjet(undefined), '(inconnu)');
});
