# CheckMyPro

Plateforme de vérification de professionnels du bâtiment et de l'artisanat.

## État du repo

Ce repo contient le code du backend Lot 1.

Il **n'a pas encore été exécuté sur une machine réelle**. Il ne contient
pas de `package-lock.json` — ce fichier sera généré lors du premier
`npm install` local et devra être commité pour verrouiller la baseline.

### Ce qui est actif

Trois modules NestJS sont importés dans `AppModule` et se chargeront
au démarrage de l'API : **Auth**, **Users**, **Health**.

| Module | Endpoints |
|--------|-----------|
| Auth | `POST /api/v1/auth/register, login, verify-otp, resend-otp, refresh, logout` |
| Users | `GET/PUT/DELETE /api/v1/users/me`, `GET me/stats`, `GET me/data-export` |
| Health | `GET /api/v1/health` |

### Ce qui est dans le repo mais non activé

Du code Lot 2 existe dans l'arborescence (vérifications, scoring, paiements,
professionnels, documents, admin, worker). Ces fichiers ne sont **pas importés
dans `AppModule`**, ne se chargent pas au démarrage et n'affectent pas
l'exécution. Ils seront activés après stabilisation dans le Lot 2.

### Ce qui n'existe pas

Back-office web, app mobile, intégrations réelles (Stripe, Twilio, S3),
tests E2E, `package-lock.json`.

## Prérequis

- Node.js >= 20
- npm >= 10
- Docker & Docker Compose

## Procédure de mise en route et verrouillage

```bash
# 1. Cloner
git clone <repo> && cd checkmypro

# 2. Installer les dépendances
#    Ceci génère package-lock.json.
npm install

# 3. Vérifier que lint, test et build passent
bash scripts/verify-lot1.sh

# 4. Si tout est vert — commiter le lockfile pour verrouiller
git add package-lock.json
git commit -m "chore: lock dependencies"

# 5. Mettre à jour la CI :
#    Dans .github/workflows/ci.yml :
#      remplacer  run: npm install
#      par        run: npm ci
#      et décommenter la ligne  cache: npm
```

Tant que l'étape 4 n'est pas faite, la baseline n'est pas verrouillée.

## Lancer le projet

```bash
cp .env.example .env        # les défauts fonctionnent en local
npm run infra:up             # Postgres + Redis via Docker
npm run dev:api              # API sur http://localhost:3000
curl http://localhost:3000/api/v1/health
```

## Scripts

| Commande | Effet |
|----------|-------|
| `npm run dev:api` | API en mode watch |
| `npm run build:api` | Build TypeScript |
| `npm run test:api` | Tests unitaires (Jest) |
| `npm run lint:api` | ESLint + Prettier |
| `npm run infra:up` | Démarrer Postgres + Redis |
| `npm run infra:down` | Arrêter Postgres + Redis |

## Tests

Les tests unitaires vivent dans `apps/api/src/`, dans des répertoires
`__tests__/` à côté du module qu'ils testent.

Jest est configuré avec `rootDir: src` et détecte tout `*.spec.ts`
dans cette arborescence. `test-setup.ts` charge `reflect-metadata`
avant l'exécution (requis par les entités TypeORM).

Les tests E2E n'existent pas encore.

## Base de données

`database/schema.sql` (22 tables) est la source de vérité.
Docker l'applique automatiquement au premier lancement.
Les évolutions futures passeront par des migrations TypeORM.

## Structure

```
checkmypro/
├── .github/workflows/ci.yml
├── .env.example
├── package.json               # scripts racine → apps/api
├── scripts/verify-lot1.sh     # vérification post-install
├── TECHNICAL_DEBT.md
├── apps/api/                  # Backend NestJS
│   ├── .eslintrc.js
│   ├── .prettierrc
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts      # Auth + Users + Health
│       ├── test-setup.ts
│       ├── config/
│       ├── common/
│       ├── database/entities/
│       └── modules/           # auth/ users/ health/ + lot2 dormant
├── apps/worker/               # non activé
├── packages/shared/
├── database/schema.sql
└── infra/docker-compose.yml
```

## Licence

Propriétaire — CheckMyPro © 2026
