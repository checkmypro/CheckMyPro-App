# Migrations TypeORM

## Stratégie

Le schéma initial est défini dans `/database/schema.sql` et appliqué automatiquement
par Docker Compose lors du premier lancement (`docker-entrypoint-initdb.d`).

Ce dossier `migrations/` est réservé aux **évolutions futures** du schéma
après le déploiement initial.

## Créer une migration

```bash
cd apps/api
npx typeorm migration:generate src/database/migrations/NomDeLaMigration -d src/config/data-source.ts
```

## Exécuter les migrations

```bash
cd apps/api
npx typeorm migration:run -d src/config/data-source.ts
```

## Rollback

```bash
cd apps/api
npx typeorm migration:revert -d src/config/data-source.ts
```

## Règles

- Jamais de modification manuelle en production
- Toujours tester la migration en staging avant prod
- Backup BDD obligatoire avant chaque migration en prod
- Chaque migration doit avoir un `up()` et un `down()`
