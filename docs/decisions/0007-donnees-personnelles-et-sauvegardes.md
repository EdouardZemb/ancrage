# ADR-0007 — Données personnelles et sauvegardes : le minimum, et une restauration prouvée

- **Statut** : accepté le 2026-10-15 ; précisé le 2026-10-18 par l'ADR-0009 sur un seul point, la
  durée des journaux ; précisé le 2026-11-12 par l'ADR-0013 sur un seul point, le mode d'une
  réponse que garde le journal ; complété le 2026-10-22 par M-0005 du modèle, à l'alignement sur la cible
  `serveur` : un instantané est un dossier qui a la forme de `/donnees`, le distant passe par
  l'alias `sauvegardes:`, et le registre des suppressions est rejoué par le crochet `REPORTER` de la
  restauration (`rejouer-suppressions --dossiers`)
- **Contexte amont** : brief §4 points 5 et 6 ; réponse 8 du 15/10 (sauvegardes hors site vers la
  même destination que creche-planner, avec un dossier et une clé séparés) ;
  [ADR-0010 de creche-planner](https://github.com/EdouardZemb/creche-planner/blob/main/docs/adr/0010-ecosysteme-applications-personnelles.md),
  clause de révision

## Contexte

- **Les personnes concernées** sont des élèves d'une école suisse, hors du foyer d'Edouard.
  - La nLPD s'applique.
  - L'exemption domestique que creche-planner revendique dans son ADR-0007 ne s'étend pas à
    ancrage.
  - Si le responsable ou le serveur se trouvent en France, le RGPD s'y ajoute. Les mesures
    ci-dessous visent les deux.
- **Les tiers par lesquels les données passent** :
  - Cloudflare : il termine le chiffrement TLS à sa périphérie, et voit donc passer les requêtes ;
  - Google Drive : les sauvegardes, chiffrées ;
  - GitHub : le code et le contenu, sans aucune donnée personnelle.

## Décision

### 1. Minimisation

| Collecté | Pas collecté |
|---|---|
| nom affiché (un pseudonyme suffit) | e-mail, téléphone, vrai nom |
| clés publiques des passkeys, avec date et nom d'appareil | mot de passe |
| appartenance aux groupes | adresse IP en base ou dans les journaux |
| journal des réponses (ADR-0004) | texte saisi par l'apprenant |
| sessions : empreinte du jeton, dates, type d'appareil | mesure d'audience, traceur, police ou script tiers |

- **Limite de débit** : elle garde les adresses IP en mémoire seulement.
- **Journaux du conteneur** : pas de corps de requête, rotation à 14 jours.

### 2. Droits des personnes, en libre-service

- **Accès et portabilité** (art. 25 et 28 nLPD) : un export JSON du profil, des appareils et de
  tout le journal de réponses.
- **Suppression du compte** : effacement immédiat et définitif, dans une transaction, de la
  personne, de ses passkeys, sessions, appartenances et événements.
  - Les sauvegardes la contiennent encore jusqu'à leur rotation, 90 jours au plus. La notice le
    dit.
  - Un **registre des suppressions** est rejoué après toute restauration, pour qu'un compte
    supprimé ne revienne pas. Il ne garde que l'identifiant opaque et la date.
- **Rectification** : le nom affiché se modifie.

### 3. Notice de confidentialité

- **Forme** : courte, en allemand et en français, versionnée avec le code, accessible depuis les
  pages d'invitation et de connexion.
- **Contenu** :
  - qui est responsable, et comment le joindre ;
  - à quoi servent les données ;
  - lesquelles sont collectées ;
  - par quels tiers elles passent, avec leur pays (art. 19 nLPD) : Cloudflare, Google Drive, et
    le pays du serveur s'il n'est pas en Suisse ;
  - combien de temps elles sont gardées : la durée du compte, 90 jours de sauvegardes, 14 jours
    de journaux ;
  - comment exercer ses droits.

### 4. Sauvegardes (prod seulement : le staging n'a que des données factices)

- **Chaque nuit**, une minuterie systemd :
  1. fait un instantané SQLite (`VACUUM INTO`) et contrôle son intégrité
     (`PRAGMA integrity_check`) ;
  2. **garde une copie locale**, en clair et lisible par son seul propriétaire, dans
     `~/backups/ancrage/`. Elle est conservée 30 jours, sur le même disque que la base vivante,
     donc sans exposition supplémentaire ;
  3. **chiffre la copie distante** avec age, pour la clé publique de sauvegarde d'ancrage, puis
     l'envoie par rclone dans un dossier `ancrage/` du Google Drive déjà utilisé par
     creche-planner. Elle y reste 90 jours.
- **La clé privée de sauvegarde n'est jamais sur le serveur.** Elle est rangée hors ligne
  (gestionnaire de mots de passe et papier). Une compromission du serveur ne permet donc pas de
  déchiffrer les sauvegardes distantes. En contrepartie, perdre cette clé rend ces sauvegardes
  inutilisables.
- **Surveillance** : un signal Healthchecks après chaque sauvegarde réussie, et un `OnFailure=`
  qui alerte.

### 5. Restauration, rejouée et pas seulement écrite

- **Le script** `deploiement/restaurer.sh <fichier>` :
  1. arrête l'application ;
  2. garde la base courante de côté ;
  3. met l'instantané en place ;
  4. rejoue le registre des suppressions ;
  5. redémarre l'application et contrôle sa santé.
- **Chaque semaine, automatiquement** : la dernière copie locale est restaurée dans un conteneur
  jetable. On contrôle son intégrité et le nombre de lignes, puis on envoie un signal
  Healthchecks.
- **Chaque trimestre, à la main et chronométré** : on restaure depuis Google Drive sur le PC,
  avec la clé hors ligne, comme si le serveur était perdu.
- **Objectifs** : on accepte de perdre au plus 24 heures de données. On vise une heure pour
  remettre le service en route, ce que le premier exercice mesurera.

## Conséquences

- **Coût** :
  - les routes d'export et de suppression ;
  - la notice ;
  - le registre des suppressions ;
  - deux minuteries : sauvegarde et test de restauration ;
  - un exercice trimestriel.
- **Difficile à changer** : la promesse de la notice. Collecter une donnée de plus obligera à
  modifier la notice et à prévenir les personnes.

## Révision

À rouvrir dans quatre cas :

- l'e-mail est ajouté ;
- l'application s'ouvre au-delà de la classe ;
- une mesure d'audience est envisagée ;
- l'enseignante doit voir la progression des élèves.
