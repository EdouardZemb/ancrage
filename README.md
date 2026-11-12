# ancrage

Application d'apprentissage **mobile d'abord**, auto-hébergée : des cours, des droits par cours, et
une progression par personne.

## Pourquoi

Retenir un vocabulaire demande des rappels espacés, là où l'on a cinq minutes : sur le téléphone,
avec ou sans réseau. `ancrage` sert des cours à des personnes invitées. Chaque cours a ses droits,
et chaque personne sa progression, tenue en journal sur le téléphone puis synchronisée.
L'application s'installe, marche hors ligne, et l'interface d'un cours est dans sa langue.

Ce dépôt porte le code, un cours d'exemple inventé (`exemple-contenu/`) et les documents ; le
travail s'y fait en français. Il ne porte ni vrai cours, ni secret, ni valeur d'un hôte : ce qui
fait d'une installation celle d'une personne est dans un dépôt de données privé, qui n'est pas ici.
Il n'a pas de licence : tous droits réservés.

L'état du projet est dans [CLAUDE.md](CLAUDE.md#état), les versions dans [les publications](https://github.com/EdouardZemb/ancrage/releases).

## Démarrer

Il faut Node 24 et `corepack`.

```sh
corepack enable
corepack pnpm install
corepack pnpm build
corepack pnpm start
```

Le serveur écoute sur `http://localhost:3000`. Sans contenu monté, il sert le cours d'exemple et le
dit au démarrage.

Les autres commandes sont dans [CLAUDE.md](CLAUDE.md#commandes).

## Où lire quoi

| Document | À lire quand |
|---|---|
| [CLAUDE.md](CLAUDE.md) | avant de travailler ici |
| [La méthode](docs/modele/methode.md) | pour la façon de travailler, commune aux projets nés de `modele-projet` |
| [Les pistes](docs/pistes.md) | pour ce qui est noté sans être engagé |
| [Le registre](docs/registre.md) | pour ce que les lots ont appris |
| [Les décisions](docs/decisions/) | pour ce qui a été décidé, et pourquoi |
| [Les décisions de chaque lot](docs/conception/) | pour une décision numérotée que cite le code |
| [Le format des contenus](docs/format-des-contenus.md) | pour écrire ou relire un cours |
| [L'exploitation](docs/exploitation.md) | pour mettre en service, déployer, restaurer |

## Contribuer

Projet personnel : aucune contribution n'est attendue.
