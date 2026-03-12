# Dette technique connue

Ce fichier documente les compromis techniques acceptés temporairement.
Chaque item sera résolu avant ou pendant le Lot indiqué.

---

## DT-001 — Worker dépend des entités de l'API

**Composant** : `apps/worker/`
**Nature** : Le worker importe les entités TypeORM depuis `apps/api/src/database/entities/`
via un alias tsconfig (`@entities/*` → `../api/src/database/entities/*`).

**Pourquoi c'est un problème** : Si l'API modifie une entité, le worker doit être
recompilé et redéployé même s'il n'est pas directement affecté. Les deux services
ne sont pas indépendants au build.

**Pourquoi c'est accepté pour l'instant** : Le worker n'est pas encore activé.
Les entités sont la source de vérité unique pour la structure BDD — les dupliquer
créerait un risque de désynchronisation plus grave que le couplage actuel.

**Résolution prévue (Lot 2.1)** : Extraire les entités dans `packages/database/`
en tant que package partagé du monorepo. L'API et le worker importeront
depuis `@checkmypro/database`. Le build de chaque app sera indépendant.

**Criticité** : Faible (le worker n'est pas activé).

---

## DT-002 — Modules Lot 2 présents mais non activés

**Composant** : `apps/api/src/modules/` (verifications, professionals, documents, payments, scoring, admin)
**Nature** : Le code existe dans le repo mais n'est pas importé dans `AppModule`.
Il ne se charge pas au démarrage et n'affecte pas l'exécution.

**Pourquoi c'est accepté** : Le code a été développé en amont pour préparer le Lot 2.
Le garder dans le repo évite de le perdre et permet de le stabiliser progressivement.

**Résolution prévue (Lot 2.1)** : Chaque module sera révisé, testé, puis activé
dans `AppModule` un par un. Les modules qui nécessitent BullModule (queues Redis)
seront activés ensemble avec la configuration Bull.

**Criticité** : Nulle (code dormant, aucun impact runtime).

---

## DT-003 — Pas de package-lock.json

**Composant** : racine du repo
**Nature** : Le fichier `package-lock.json` n'est pas encore généré car le repo
n'a pas encore été installé sur une machine réelle avec accès réseau.

**Impact** : La CI utilise `npm install` au lieu de `npm ci`, ce qui est
plus lent et non déterministe.

**Résolution** : Au premier `npm install` local, commiter le `package-lock.json`
généré, puis passer la CI à `npm ci` et réactiver `cache: npm`.

**Criticité** : Faible (résolu dès le premier clone).
