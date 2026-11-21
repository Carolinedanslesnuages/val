# val

<!-- pauline:debut empreinte=d726342223e1 -->
## Consignes communes

Ces consignes valent pour tous mes dépôts. Elles passent avant les habitudes de l'agent, jamais
avant la sécurité.

### Langue
- Le code est en anglais : noms de variables, fonctions, classes, fichiers, et commentaires.
- Le reste est en français, avec des phrases courtes et simples, sans jargon inutile :
  documentation, messages de commit et de PR, réponses.

### Commits et pull requests
- Titres au format Conventional Commits, le type d'abord, puis l'emoji
  [Rose](https://github.com/Carolinedanslesnuages/rose) : `feat: 🌸 …`, `fix: 🐞 …`, `docs: 🧾 …`.
  Un changement incompatible prend un `!` : `feat!: 🧨 …`.
- Une PR fait une seule chose. Sa description dit ce qui change, pourquoi, et comment c'est vérifié.

### Code
- Des noms qui disent ce qu'ils contiennent : au moins 4 caractères, aucune abréviation
  obscure, pas de `x`, `tmp`, `res` ou `val`. Écrire `user`, `index`, `response`, `value`.
- Un fichier, une responsabilité : 400 lignes non vides au plus pour le code, 600 pour les tests
  (contrôlé par [Constance](https://github.com/Carolinedanslesnuages/constance)).
- Toute fonctionnalité ou correction arrive avec ses tests. Ne jamais désactiver ni affaiblir un
  test pour faire passer la CI.

### Accessibilité
- Respecter le RGAA 4.1.2. Citer un critère avec son numéro et son texte officiel
  ([Marguerite](https://github.com/Carolinedanslesnuages/marguerite)), jamais de mémoire.
- Un contrôle automatique (axe-core) ne suffit pas : vérifier aussi au clavier et avec la
  méthodologie officielle du critère.

### Dépendances
- N'ajouter que des paquets qui existent vraiment, publiés depuis au moins deux semaines, sous une
  licence compatible (MIT, Apache 2.0, BSD, ISC), avec une version exacte.
- Préférer le code déjà présent à une nouvelle dépendance.

### Sécurité et données
- Aucun secret, jeton, mot de passe ni donnée personnelle réelle dans le dépôt, les tests ou les
  journaux.
- Les workflows GitHub déclarent leurs droits (`permissions:`).
- Ne jamais lancer `git push --force` sur la branche principale, ni supprimer des fichiers hors du
  projet.
- Ne pas modifier `.github/`, `AGENTS.md` ou `CLAUDE.md` sans le dire clairement dans la PR.

### En cas de doute
- Demander plutôt que deviner. Dire ce qui n'a pas été vérifié.
<!-- pauline:fin -->

## Consignes de ce projet

Les consignes propres à ce projet viennent ici.
