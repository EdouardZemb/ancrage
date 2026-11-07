# ADR-0006 — Chaîne de livraison : CI chez GitHub, déploiement par le serveur lui-même

- **Statut** : accepté le 2026-10-15 ; complété le 2026-10-22 par M-0003 et M-0004 du modèle
  (`docs/modele/decisions/`), à l'alignement sur la cible `serveur` de `modele-projet` : la
  mécanique de déploiement est celle du modèle, l'identité age est celle du serveur
  (`~/.config/sops/age/serveur.txt`), sa configuration Docker aussi (`~/.config/serveur/docker`),
  le tunnel devient commun au serveur, et les secrets se refont sur le poste (`secrets.ps1`)
- **Contexte amont** : brief §2 points 1 à 3 et §4 point 5 ; chaîne de creche-planner (dépôt
  public) prise comme modèle, en réduit ; `~/NOTES-EXPLOITATION.md` sur le serveur

## Contexte

- **creche-planner** a construit une chaîne éprouvée :
  - des images construites par GitHub, publiées sur GHCR ;
  - un serveur qui **va chercher lui-même** les nouvelles versions, par des minuteries systemd,
    sans aucun port entrant ;
  - des contrôles de santé et un retour arrière automatique ;
  - des secrets chiffrés (sops + age).
- **Contraintes propres à ancrage** :
  - le dépôt est privé, sur GitHub Free : pas de protection de branche possible (vérifié le
    15/10, erreur 403), et un quota mensuel de minutes de CI ;
  - les images contiennent du contenu protégé, elles restent donc privées. Le serveur doit
    s'authentifier pour les récupérer ;
  - le serveur est partagé avec creche-planner et d'autres services, auxquels on ne touche pas ;
  - leçon des notes d'exploitation : un fichier posé à la main sur l'hôte finit par diverger, en
    silence ;
  - le runner auto-hébergé appartenait à un autre dépôt (arrêté le 15/10), et un compte
    personnel ne peut pas partager un runner entre plusieurs dépôts.

## Décision

### 1. Branches

`main` est la seule branche durable. Les autres sont courtes : une PR par changement, fusionnée
en un seul commit (squash). Sans protection possible, la règle est écrite dans `CLAUDE.md` : on ne
fusionne qu'avec une CI entièrement verte. Le filet de sécurité est structurel : aucune image
n'est publiée pour un commit dont la CI échoue, donc du code rouge n'atteint jamais le serveur.

### 2. CI

Elle tourne sur les machines de GitHub (`ubuntu-latest`), avec des actions épinglées par SHA.

- **Sur chaque PR et sur `main`** :
  - lint, format et types ;
  - tests unitaires ;
  - validation du contenu, `ids.lock` compris ;
  - recherche de secrets (gitleaks) ;
  - construction de l'image ;
  - tests de bout en bout Playwright **contre l'image construite** ;
  - vérification que les fichiers servis au navigateur ne contiennent aucun texte de cours.
- **Tests de mutation** (Stryker) sur `src/domaine` (accès, jugement, planification) :
  - à chaque PR qui touche ces modules, avec un seuil bloquant fixé par le lot qui introduit le
    module ;
  - et une passe complète chaque semaine.
- **Sur `main`, après une CI verte** : publication de `ghcr.io/edouardzemb/ancrage` sous `:main`
  et `:sha-<sha>`.
- **Sur une étiquette `vX.Y.Z`** : l'image `:sha-<sha>` existante reçoit l'étiquette `:X.Y.Z`,
  **sans reconstruction**, et une Release GitHub est créée. La prod reçoit ainsi exactement les
  octets testés en staging.
- **Signature des images (cosign)** : non retenue pour l'instant. Les images sont privées et
  récupérées avec authentification. Une signature sans clé inscrirait le nom du dépôt privé, le
  workflow et le commit dans le journal public Rekor. À reconsidérer si les images deviennent
  publiques.

### 3. Environnements

Les deux environnements utilisent **le même fichier compose** ; seuls l'environnement et le nom
de projet changent.

| | Staging | Prod |
|---|---|---|
| Adresse | `ancrage-staging.<domaine>` | `ancrage.<domaine>` |
| Suit | `:main` | la plus haute étiquette `vX.Y.Z` |
| Données | factices, écrites à la main (ADR-0010 §3) | réelles |
| Contenu des cours | le vrai | le vrai |
| Sauvegardes | non | oui (ADR-0007) |

- **Un tunnel Cloudflare par environnement**, en mode jeton, avec son conteneur `cloudflared` dans
  le compose de l'environnement. Chaque environnement est autonome, et creche-planner n'est pas
  modifié.
- **Pourquoi `ancrage-staging` et pas `staging.ancrage`** : le certificat gratuit de Cloudflare ne
  couvre qu'un niveau de sous-domaine.

### 4. Déploiement : le serveur va chercher les versions

- **Clones** : `~/ancrage` (prod) et `~/ancrage-staging` sont des clones du dépôt, avec une clé de
  déploiement en lecture seule. Les fichiers compose et les scripts viennent donc du dépôt.
- **Sonde** : une minuterie systemd par environnement, toutes les 5 minutes, lance
  `deploiement/sonder.sh <env>`, qui :
  - prend un verrou ;
  - **refuse et alerte si le clone a été modifié sur place** (la leçon de creche-planner) ;
  - lance `git pull --ff-only` ;
  - détermine la cible ;
  - lance `deploiement/deployer.sh` si la cible diffère de ce qui tourne.
- **Déploiement** :
  1. instantané de la base ;
  2. récupération de l'image et `up -d --wait` ;
  3. contrôle de `/api/sante` par le port local, qui renvoie la version, l'empreinte de l'image et
     la version du schéma ;
  4. en cas d'échec, retour à l'empreinte précédente (gardée dans un fichier d'état) et alerte.
- **Dérive de l'hôte** : à chaque passage, la sonde compare les unités systemd installées avec
  `deploiement/systemd/`. Un écart déclenche une alerte. Les unités s'installent par script,
  jamais à la main.
- **Déploiement ou retour arrière manuel** : `deployer.sh <env> <version|empreinte>`, par SSH.

### 5. Migrations de base

- Ce sont des migrations SQL Drizzle versionnées, appliquées au démarrage dans une transaction,
  après l'instantané pris par `deployer.sh`.
- **Règle : ajouter avant d'enlever.** Une migration doit laisser fonctionner l'image précédente.
  Revenir à l'image précédente ne demande donc pas de restaurer la base.
- Une PR qui ne peut pas respecter cette règle le déclare. Son retour arrière passe alors par la
  restauration de l'instantané (ADR-0007).

### 6. Secrets

- **Chiffrés dans le dépôt** : sops + age, avec un fichier `deploiement/<env>.env.enc` par
  environnement.
  - L'identité age d'ancrage est dans `~/.config/sops/age/ancrage.txt` (`SOPS_AGE_KEY_FILE`). Le
    fichier de clés de creche-planner n'est pas touché.
  - Une copie hors ligne de cette clé est conservée par Edouard.
  - Le déchiffrement se fait dans `/dev/shm`, et le fichier est effacé après usage.
  - Contenu : jetons des tunnels, adresses de surveillance.
- **Hors sops** :
  - un jeton GitHub classique `read:packages` (les jetons à granularité fine ne couvrent pas GHCR
    à ce jour), rangé dans une configuration Docker propre à ancrage
    (`DOCKER_CONFIG=~/.config/ancrage/docker`). Il a une date d'expiration et un rappel de
    rotation ;
  - la clé de déploiement SSH en lecture seule.

### 7. Surveillance

- Healthchecks.io reçoit, pour chaque environnement, un signal après chaque sonde réussie et
  après chaque sauvegarde (ADR-0007).
- Les unités systemd ont un `OnFailure=` qui alerte : chez creche-planner, une sauvegarde est
  restée en échec 6 semaines sans que personne le sache.

## Conséquences

- **Ce qui tourne** :
  - deux piles compose de deux conteneurs chacune ;
  - deux tunnels ;
  - deux minuteries de sonde, plus celles de sauvegarde et de test de restauration (ADR-0007) ;
  - quelques scripts dans `deploiement/`.
- **Une CI dure environ dix minutes**. À mesurer face au quota de minutes du plan gratuit.
- **Ce qu'Edouard seul peut faire** :
  - créer les deux tunnels et leurs noms d'hôte dans Cloudflare ;
  - créer le jeton `read:packages` ;
  - créer les contrôles Healthchecks ;
  - ranger les clés privées age hors ligne.
- **Difficile à changer** : peu de chose. Le modèle par tirage, GHCR et la convention « étiquette
  = prod » se remplacent sans toucher l'application.

## Révision

À rouvrir dans quatre cas :

- passage à GitHub Pro : on ajoute alors la protection de `main` avec les contrôles obligatoires ;
- dépassement du quota de minutes ;
- images rendues publiques : la signature redevient pertinente ;
- un second serveur.
