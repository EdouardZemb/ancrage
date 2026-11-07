# ancrage

Application d'apprentissage **mobile d'abord**, auto-hébergée : des cours, des droits par cours, et
une progression par personne, synchronisée depuis le téléphone. L'interface d'un cours est dans sa
langue ; le travail sur le projet se fait en français.

Ce dépôt porte le code, un cours d'exemple inventé (`exemple-contenu/`) et les documents de
conception et d'exploitation. Il n'a pas de licence : tous droits réservés. Ce qui fait d'une
installation celle d'une personne (le vrai cours, les secrets, les valeurs de l'hôte) est dans un
dépôt de données privé, qui n'est pas ici.

## Lancer l'application sur le cours d'exemple

Il faut Node 24 et `corepack`.

```sh
corepack enable
corepack pnpm install
corepack pnpm build
corepack pnpm start
```

Le serveur écoute sur `http://localhost:3000`. Sans contenu monté, il sert le cours d'exemple et le
dit au démarrage. Pour travailler avec rechargement automatique : `corepack pnpm dev:serveur` et
`corepack pnpm dev:client`. Les tests : `corepack pnpm test`.

## Où lire la suite

- Pour travailler dans ce dépôt, que l'on soit une personne ou une IA : [`CLAUDE.md`](CLAUDE.md),
  qui donne les commandes, les invariants et la méthode.
- Les décisions : [`docs/decisions/`](docs/decisions/).
- Le format des contenus : [`docs/format-des-contenus.md`](docs/format-des-contenus.md).
- L'exploitation : [`docs/exploitation.md`](docs/exploitation.md).
- Les décisions de chaque lot : [`docs/conception/`](docs/conception/).
