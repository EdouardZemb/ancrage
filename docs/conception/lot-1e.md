# Lot 1e — décisions et arbitrages

Le lot 1e (issue ancrage-donnees#6, v0.5.0) a donné aux personnes leurs droits sur leurs données, et ouvert
ancrage à l'apprenante :
- l'export, la rectification du nom, la suppression du compte ;
- le registre des suppressions, rejoué à la restauration ;
- la notice de confidentialité, en français et en allemand ;
- la purge, les journaux sans donnée personnelle (ADR-0009) ;
- les points notés « avant l'ouverture à l'apprenante » dans ancrage-donnees#39 et ancrage-donnees#55.

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« 1e-D<n> ») ;
- les arbitrages faits pendant l'exécution (« 1e-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** Les décisions durables sont dans les ADR : l'ADR-0007 pour les données personnelles et
les sauvegardes, l'ADR-0009 pour les journaux.

## Les décisions du plan (18/10/2026)

Elles reprennent les réponses d'Edouard aux onze questions du cadrage (commentaire du 18/10/2026
sur ancrage-donnees#6 : « OK pour les défauts »). Quand un arbitrage en a changé une, la ligne le dit.

1. **1e-D1, responsable** : Edouard, à titre privé. Son contact dans la notice est son adresse
   e-mail.
2. **1e-D2, pays et droit applicable** : le pays, les autorités et les tiers de l'instance sont dans
   `notice.yaml` du dépôt de données.
   - Le RGPD s'ajoute à la nLPD.
   - La base légale est l'exécution du service demandé (art. 6, par. 1, let. b RGPD).
3. **1e-D3, registre des suppressions** : table `suppression (personne PK, supprime_le)`, sans clé
   étrangère.
   - L'entrée s'écrit dans la même transaction que la suppression.
   - Elle est purgée après 100 jours, soit plus que les 90 jours de rétention des sauvegardes.
   - `restaurer.sh` le rejoue : application arrêtée, il le lit dans la base courante et l'applique
     à l'instantané, avant de le mettre en place. C'est un écart assumé avec l'ordre de
     l'ADR-0007 §5 (mettre en place, puis rejouer) : un rejeu en échec laisse en service la base
     courante, jamais un instantané où des comptes supprimés seraient revenus. 1e-R8 ajoute
     `--sans-registre`.
4. **1e-D4, suppression d'un compte** : par `DELETE /api/moi` pour soi-même, par
   `DELETE /api/admin/personnes/:id` pour le propriétaire.
   - Le compte du propriétaire est toujours refusé (409 `proprietaire`).
   - La cascade emporte passkeys, sessions, liens, appartenances, autorisations et événements.
   - `secure_delete` est actif sur la base, et la suppression est suivie d'un
     `wal_checkpoint(TRUNCATE)`.
   - Sur l'appareil, tout est effacé, file de la personne comprise. C'est la première des deux
     exceptions à l'invariant 5 (la seconde est en 1e-D11) : le journal d'une personne disparaît avec
     son compte. Le téléphone efface
     aussi ses passkeys, si Chrome connaît l'API Signal.
   - 1e-R13 exige l'en-tête de personne ; 1e-R14 fixe l'état après la suppression.
5. **1e-D5, export** : `GET /api/moi/export`, en pièce jointe JSON. Il contient :
   - le profil, les passkeys (clé publique comprise), les sessions et les noms des groupes ;
   - par cours **visible**, le titre et tous les événements.

   Rien n'y figure d'un cours que la personne ne voit plus, pas même son identifiant
   (invariant 1). La notice le dit, et renvoie au responsable pour le reste (1e-R3).
6. **1e-D6, nom affiché et passkeys** :
   - le nom affiché se modifie dans « Compte » (« Mon compte » dans le plan, 1e-R1) ;
   - il devient l'étiquette des passkeys (`user.name` et `user.displayName`) ;
   - le client signale le nom au téléphone (`signalCurrentUserDetails`) après une connexion et
     après un changement.
7. **1e-D7, lien pour un autre appareil** : un seul lien de connexion actif par personne, quel que soit
   son auteur. En créer un annule le précédent, dans une transaction.
   - `GET /api/moi/appareils` donne `lien: { expireLe } | null`.
   - `DELETE /api/moi/lien` l'annule.
   - Aucune nouvelle vérification par passkey.
8. **1e-D8, propriétaire** :
   - `GET /api/admin/personnes` donne les passkeys de chaque personne ;
   - `DELETE /api/admin/personnes/:id/passkeys/:passkey` en supprime une, même la dernière ;
   - le propriétaire peut supprimer un compte (décision 4).
9. **1e-D9, purge**, au démarrage puis toutes les 6 heures :
   - les sessions expirées ;
   - les liens utilisés ou expirés ;
   - les entrées du registre de plus de 100 jours.

   Depuis la revue finale, chaque purge vide aussi le journal WAL.
10. **1e-D10, journaux** : seulement le modèle de la route (`/api/moi/passkeys/:id`), ou le premier
    segment d'un chemin sans route (`/cours/…`).
    - Jamais d'identifiant, de requête (`?depuis=`) ni de jeton.
    - Le plafond par taille reste (3 × 5 Mo).
    - L'ADR-0009 remplace la « rotation à 14 jours » de l'ADR-0007, avec l'exception du tunnel
      (1e-R4).
11. **1e-D11, déconnexion bloquée (R31b du lot 1d)** : après une `ErreurReponsesEnAttente`, quelle qu'en soit la
    cause, un bouton à confirmer « Se déconnecter et abandonner N réponses » apparaît.
    - La session doit toujours être fermée sur le serveur (un 401 vaut fermeture).
    - Sans réseau, rien n'est effacé (R30 du lot 1d tient).
    - C'est la seconde exception à l'invariant 5 : les réponses abandonnées ne partent jamais.
12. **1e-D12, persistance** : `navigator.storage.persist()` est demandé sans bruit, après une connexion et
    au démarrage d'une session connue.
13. **1e-D13, error boundaries** : une autour de l'onglet du cours (`key` = l'onglet), dans la langue du
    cours, et une autour de l'écran, dans la langue de la personne. Toutes deux proposent
    « Recharger ». 1e-R12 change la clé de celle de l'écran.
14. **1e-D14, points de ancrage-donnees#39** :
    - un gestionnaire d'erreurs racine : un 4xx passe intact, un 5xx rend `{ erreur: 'interne' }`
      sans message ;
    - `Referrer-Policy: no-referrer` sur toute réponse ;
    - `ANCRAGE_URL_PUBLIQUE` est obligatoire dans le compose et écrite dans `compose.env`.
15. **1e-D15, notice** : un écran public `/confidentialite`, en français et en allemand, avec bascule de
    langue.
    - Un lien y mène depuis le pied de page de tous les écrans.
    - Le français fait foi ; l'allemand en est la traduction fidèle.
    - La version (`NOTICE_VERSION`) est la date de fusion. Collecter une donnée de plus, changer de
      tiers ou de pays oblige à modifier la notice et à prévenir les personnes (ADR-0007, ADR-0009).
16. **1e-D16, relecture allemande** : la liste est dans la boîte de réception d'Edouard
    (`2026-10-18-ancrage-textes-allemands-a-relire.md`), notice comprise. Ce qui revient avant
    l'étiquette y entre ; le reste suit en v0.5.1.
17. **1e-D17, déroulé** : six PR d'implémentation (A1-A3 serveur, B1-B3 client), une revue finale, la
    clôture, puis la v0.5.0 avec l'accord d'Edouard. Edouard invite l'apprenante lui-même en prod.

## Les arbitrages de l'exécution (18/10/2026)

- **1e-R1** : la notice nomme les libellés réels de l'interface : « Compte » / « Konto » (le lien
  en haut de l'écran), et non « Mon compte ».
- **1e-R2** : les documents en avance sur le code de la PR A1 sont corrigés dans la PR.
- **1e-R3** : la notice dit que la progression d'un cours qui n'est plus ouvert reste gardée sans
  figurer dans l'export, et qu'on peut la demander au responsable.
- **1e-R4** : l'ADR-0009 limite la règle « sans donnée personnelle » aux journaux de
  l'application. Il nomme l'exception du tunnel : cloudflared peut écrire l'adresse d'une requête
  qui n'a pas atteint l'application, sans l'adresse IP, dans un journal plafonné en taille. Son
  niveau reste par défaut. La notice le dit.
- **1e-R5** : l'ADR-0009 et les commentaires des journaux sont remis d'accord avec le code (le
  premier segment journalisé est borné ; les lignes internes de Fastify sont nommées).
- **1e-R6** : « un niveau fatal cacherait la plupart des diagnostics du tunnel » est la définition
  d'un niveau de journal, sans « à notre connaissance ».
- **1e-R7** : un faux positif de gitleaks se corrige en réécrivant le commit de la branche de PR,
  jamais par une exception.
- **1e-R8** : `restaurer.sh --sans-registre` saute le rejeu, et le journal dit que les comptes
  supprimés depuis l'instantané reviennent. Par défaut, le rejeu est obligatoire. Une image qui
  ne connaît pas `rejouer-suppressions` (code 64) renvoie à cette option.
- **1e-R9** : la restauration retire les fichiers `-wal`, `-shm` et `-journal` laissés par une
  interruption, avant la copie ; son plan affiché dit ce qui revient sans base courante.
- **1e-R10** : l'abandon d'une seule réponse a ses propres textes au singulier.
- **1e-R11** : la documentation et les commentaires de la déconnexion sont remis d'accord avec le
  code.
- **1e-R12** : le filet de l'écran est indexé par l'identité de l'écran (`cleDuFiletDEcran`), pas
  par le chemin : un changement d'onglet ne remonte pas tout l'écran du cours.
- **1e-R13** : `DELETE /api/moi` exige l'en-tête `x-ancrage-personne` : 400 s'il manque, 409
  `autre_personne` s'il nomme une autre personne, avant toute suppression. La route est neuve,
  donc l'invariant 8 ne demande pas d'attendre une version.
- **1e-R14** : après une suppression réussie, le signal au téléphone part quoi qu'il arrive, et
  l'écran passe à la connexion. Si l'effacement local a échoué, la page de connexion le dit et
  dit quoi faire.
- **1e-R15** : `GET /api/moi/appareils` contrôle `x-ancrage-personne` s'il est présent (route
  existante, invariant 8). Le client ne signale rien au téléphone sur une erreur.
- **1e-R16** : la notice cite aussi la date de création du compte, le détail des examens et le
  code aléatoire de l'appareil.
- **1e-R17** : la notice nomme la signature du navigateur (User-Agent), dont seul le type
  d'appareil est tiré, et dit que le code de l'appareil reste après la déconnexion.
- **1e-R18** : la notice cite le détail complet des examens et le caractère nécessaire des
  données (art. 13 RGPD) ; une fixture de contexte d'écran partagée remplace trois copies.
- **1e-R19** : la revue finale corrige, avant l'ouverture à l'apprenante, ce qui touche la vérité de la notice, le
  téléphone partagé et le secours. Le reste va dans l'issue « Lot 1e : suites » (ancrage-donnees#65).
- **1e-R20** : le bouton de suppression dit que les sauvegardes gardent les données « 90 jours
  environ ». La notice porte la règle exacte : la rotation ne tourne qu'après une sauvegarde
  réussie.
- **1e-R21** : la procédure « Rejouer le registre à la main » (`docs/exploitation.md`) n'est
  vérifiée qu'à la lecture ; son essai sur le staging est dans les suites.
- **1e-R22** : `DELETE /api/moi/sessions/:id` et `DELETE /api/moi/passkeys/:id` restent sans
  contrôle de l'en-tête : ils n'agissent que sur la personne de la session.
- **1e-R23** : la notice dit que l'adresse IP n'est jamais enregistrée, qu'elle est gardée en
  mémoire pour limiter les tentatives de connexion, et oubliée au plus tard au redémarrage : le
  magasin de `@fastify/rate-limit` n'a pas de durée de vie. Un magasin qui l'oublie à la fin de sa
  fenêtre est dans les suites.
- **1e-R24** : les restes de la relecture de la revue finale sont corrigés sans nouvelle ronde.
- **Revue finale** : le changement de nom ou de langue et le lien pour un autre appareil
  contrôlent `x-ancrage-personne` s'il est présent (routes existantes, invariant 8). Le client
  l'envoie, ne prend jamais le profil d'une autre personne et ne signale pas son nom au
  téléphone.
