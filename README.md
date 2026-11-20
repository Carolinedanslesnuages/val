# Val

L'empreinte carbone de votre usage de Claude Code, estimée en fourchette à partir de ses
journaux locaux.

Val lit **seulement les compteurs** que Claude Code enregistre sur votre ordinateur : la date,
le dossier de travail, le modèle et le nombre de tokens. Le contenu de vos échanges n'est jamais
lu ni envoyé, et Val ne se connecte à rien.

Le nom rend hommage à Valérie Masson-Delmotte, climatologue, qui a coprésidé le groupe 1 du GIEC
(les bases scientifiques du climat).

## Utilisation

Il faut Node.js 20 ou plus récent.

```sh
npx github:Carolinedanslesnuages/val                 # les 7 derniers jours, par jour
npx github:Carolinedanslesnuages/val --par projet    # par dossier de travail
npx github:Carolinedanslesnuages/val --jours 30 --par semaine
```

Exemple (données de test du dépôt) :

```text
Val · empreinte carbone de votre usage de Claude Code
Du 2026-11-18 au 2026-11-19 · 3 réponses dans 1 journal

Jour         Réponses   Tokens produits        Énergie          CO2e
──────────   ────────   ───────────────   ────────────   ───────────
2026-11-18          2             1,2 k   3,7 – 7,8 Wh   1,5 – 3,1 g
2026-11-19          1               300   1,2 – 2,5 Wh   0,5 – 1,0 g
Total               3             1,5 k      5 – 10 Wh   2,0 – 4,1 g

Soit environ : 0,01 à 0,03 km en voiture thermique · 0,03 à 0,06 h de streaming vidéo · 1,6 à 3,3 recherches web.

À savoir :
· Fourchette selon la méthode EcoLogits (ADEME). Anthropic ne publie pas la taille de ses
  modèles : les tailles utilisées sont des hypothèses (val --methode pour le détail).
· Seuls les tokens produits comptent (1,5 k). Les 1,5 k tokens lus (contexte, cache) ne sont
  pas comptés : pour un agent qui relit beaucoup, le vrai chiffre est plus haut.
· Ni l'entraînement des modèles ni votre ordinateur ne sont comptés.
```

| Option | Rôle |
|---|---|
| `--jours <n>` | Les n derniers jours (défaut : 7). |
| `--depuis <date>`, `--jusqua <date>` | Une période précise, dates `AAAA-MM-JJ` incluses. |
| `--tout` | Tout l'historique disponible. |
| `--par <critère>` | `jour` (défaut), `semaine`, `projet` ou `modele`. |
| `--json` | Résultat en JSON, pour un tableau de bord ou un script. |
| `--dossier <chemin>` | Dossier des journaux (défaut : `~/.claude/projects`). |
| `--methode` | La méthode et les hypothèses. |

## Méthode

Val applique la méthode [EcoLogits](https://ecologits.ai/latest/methodology/llm_inference/)
(GenAI Impact), une analyse de cycle de vie ouverte qui s'appuie sur la Base Empreinte de
l'ADEME. Les équivalents (voiture, streaming, recherche web) viennent d'[Impact CO2](https://impactco2.fr)
(ADEME).

- **Électricité** des serveurs (GPU et reste du serveur, PUE des centres de données) et
  **fabrication** du matériel, au prorata du temps d'utilisation.
- **Électricité à 384 g CO2e/kWh** : le mix des États-Unis (Ember 2024), où se trouvent les
  centres de données utilisés par Anthropic.
- **Une fourchette, pas un chiffre** : Anthropic ne publie pas la taille de ses modèles. Val
  reprend l'estimation d'EcoLogits pour Claude 3 Opus et suppose des tailles plus petites pour
  Sonnet et Haiku. Un modèle inconnu prend la taille d'Opus, la plus prudente.

### Ce qui n'est pas compté

- **Les tokens lus** (contexte, cache) : comme EcoLogits, seuls les tokens produits comptent.
  Un agent de code relit beaucoup : le vrai chiffre est plus haut.
- **L'entraînement** des modèles, le réseau et votre ordinateur.

Améliorer une hypothèse corrige tout l'historique : les calculs sont refaits à chaque lancement.

## Comment les journaux sont lus

Claude Code écrit une même réponse sur plusieurs lignes, une par bloc de contenu. Val compte
chaque réponse une seule fois, grâce à son identifiant. Les messages produits par Claude Code
lui-même, sans appel au modèle, sont ignorés. Seuls les journaux modifiés pendant la période
demandée sont ouverts.

## Développer

```sh
npm test
```

## Licence

[MIT](LICENSE).
