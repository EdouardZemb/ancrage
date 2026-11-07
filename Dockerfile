# Pas de directive de syntaxe en première ligne : elle ferait tirer de Docker Hub, à chaque
# construction, un frontend BuildKit flottant. Ce Dockerfile n'utilise que la syntaxe intégrée à
# BuildKit.
#
# Quatre étapes : dépendances (`pnpm fetch`), construction (`pnpm build`), dépendances de
# production seulement, puis exécution. L'étape d'exécution ne contient ni pnpm ni les outils de
# construction : seulement `dist/`, `exemple-contenu/`, les `node_modules` de production et
# `package.json`. Le contenu de l'instance n'y entre jamais (S1-D12, ADR-0011) : le déploiement le
# monte en lecture seule sur `/contenu`.
#
# better-sqlite3 est livré avec ses binaires précompilés (linux-x64 glibc) : son script
# d'installation ne tourne pas (`pnpm.ignoredBuiltDependencies`), et l'image n'a ni Python ni
# chaîne de compilation.

# --- Base de construction --------------------------------------------------------------------
# node:24-bookworm-slim (Node 24.22.0), résolue le 2026-10-15 ; empreinte de l'index
# multi-architecture. corepack (livré avec Node 24) installe le pnpm de `packageManager`.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

# --- Dépendances : on remplit le magasin pnpm à partir du seul fichier de verrouillage -------
FROM base AS dependances
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch

# --- Construction : client (Vite), serveur (tsc) et migrations dans `dist/` -------------------
FROM dependances AS construction
RUN pnpm install --offline --frozen-lockfile
COPY tsconfig.json tsconfig.serveur.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
# Le client porte sa révision (2a-D5) : l'image se reconstruit à chaque commit, sans cache de couches en CI.
ARG REVISION=local
RUN pnpm build

# --- Dépendances de production seulement -------------------------------------------------------
# `pnpm fetch` laisse dans `node_modules/.pnpm` toutes les dépendances, développement comprises, et
# `install --prod` ne les en retire pas : on repart d'un `node_modules` vide, le magasin suffit.
FROM dependances AS production
RUN rm -rf node_modules \
    && pnpm install --offline --frozen-lockfile --prod

# --- Exécution ---------------------------------------------------------------------------------
# Même base que ci-dessus, sans corepack activé ni pnpm.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS execution
WORKDIR /app

# `/donnees` (base SQLite) et `/sauvegardes` sont les points de montage du compose : ils
# appartiennent à `node` (uid 1000). Le code reste à root, en lecture seule pour `node`.
RUN mkdir /donnees /sauvegardes \
    && chown node:node /donnees /sauvegardes

COPY --from=production /app/node_modules ./node_modules
COPY --from=construction /app/dist ./dist
# Le cours d'exemple, que le serveur sert hors de la prod quand `/contenu` n'est pas monté (S1-D3).
# Il n'entre que dans l'image d'exécution, jamais dans l'étape qui construit le client (invariant
# 3) ; le serveur le valide au démarrage, comme le contenu monté.
COPY exemple-contenu ./exemple-contenu
COPY package.json ./

# La révision vient de la CI (SHA du commit). Elle est déclarée en dernier pour qu'un changement
# de révision ne rejoue que les couches ci-dessous.
ARG REVISION=local
ENV ANCRAGE_REVISION=$REVISION \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    ANCRAGE_BASE=/donnees/ancrage.sqlite \
    ANCRAGE_CLIENT=/app/dist/client \
    ANCRAGE_CONTENUS=/contenu \
    ANCRAGE_EXEMPLE_CONTENU=/app/exemple-contenu
LABEL org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.source=https://github.com/EdouardZemb/ancrage

USER node
EXPOSE 3000

# `--start-interval` : pendant le démarrage, on sonde toutes les 2 s, pour que
# `docker compose up --wait` rende la main dès que le serveur répond.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=2s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/sante', { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/serveur/main.js"]
