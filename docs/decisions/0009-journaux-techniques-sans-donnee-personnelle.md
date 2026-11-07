# ADR-0009 — Journaux de l'application : techniques, sans donnée personnelle, plafonnés en taille plutôt qu'en durée

- **Statut** : accepté le 2026-10-18
- **Contexte amont** : ADR-0007 (§1 « Journaux du conteneur », §3 la notice), plan du lot 1a (écart
  signalé), issue ancrage-donnees#39 ; décisions 10 et 14 et arbitrage 1e-R4 du lot 1e
  (`docs/conception/lot-1e.md`)

## Contexte

**La promesse de l'ADR-0007 ne se tient pas.** Il dit : « Journaux du conteneur : pas de corps de
requête, rotation à 14 jours », et la notice doit annoncer « 14 jours de journaux ». Or Docker
plafonne les journaux par taille, pas par durée : `deploiement/compose.yml` règle le driver
`json-file` à `max-size: 5m` et `max-file: "3"`, soit 3 × 5 Mo par conteneur (l'application et le
tunnel). Selon le trafic, ce plafond couvre moins de 14 jours ou beaucoup plus : la durée n'est
ni garantie, ni bornée. Le plan du lot 1a l'avait signalé et proposait de remplacer la promesse
par « journaux techniques sans donnée personnelle, plafonnés en taille », dans la notice du lot 1e.

**Le journal de l'application contenait des identifiants.** Le sérialiseur de requêtes ne gardait
déjà ni adresse IP, ni en-tête, ni corps, et masquait le jeton sous `/invitation/` et `/lien/`.
Mais il écrivait le chemin entier et sa requête, et le lot 1e ajoute des routes dont le chemin
porte un identifiant de personne ou de passkey : `DELETE /api/moi/passkeys/:id`,
`DELETE /api/admin/personnes/:id`, `POST /api/admin/personnes/:id/lien`. Les routes du journal de
progression portent déjà l'identifiant du cours et un curseur
(`GET /api/cours/:id/journal?depuis=`). Un identifiant opaque attaché à une date reste une
donnée personnelle (nLPD, RGPD).

**Une erreur inattendue rendait son message.** Une exception d'une route (une base illisible, une
table absente) sortait avec son message dans le corps de la réponse (point de l'issue ancrage-donnees#39).

**Le tunnel n'est pas l'application.** `cloudflared` tourne à son niveau de journal par défaut
(`deploiement/compose.yml`). À notre connaissance, quand l'origine ne répond pas (par exemple
pendant le redémarrage d'un déploiement ou d'un retour arrière), il écrit alors une ligne d'erreur
qui contient l'adresse demandée (`dest=`), chemin et requête compris. Ce format n'est pas à
ancrage, et le dépôt ne le vérifie pas. Vérification faite sur le serveur le 2026-10-18 : les
journaux du tunnel, en prod comme en staging, comptaient 44 lignes chacun, sans aucune ligne
contenant `dest=` ni « Request failed ». Cette vérification ne dit rien des adresses IP.

**Les contraintes de l'hôte.** Le serveur est partagé avec d'autres applications. Les
réglages qui ne sont pas à ancrage (journald, les journaux Docker de l'hôte) sont hors de son
périmètre : une session ne les écrit pas, et Edouard seul les change. Cloudflare termine le
chiffrement et garde ses propres journaux, selon ses règles : ancrage n'y a pas accès.

## Options

- **A. Tenir les 14 jours par l'hôte.** Envoyer les journaux Docker à journald et fixer
  `MaxRetentionSec=14day`, ou purger les fichiers par une tâche planifiée. La promesse reste
  intacte et le code ne change pas. Mais l'hôte est partagé et hors du périmètre d'ancrage, et la
  rétention de journald vaut pour tout l'hôte : elle s'appliquerait aussi aux journaux de
  creche-planner, de paperless et de jellyfin, que personne ici n'a demandé à changer. Le réglage
  vit de plus hors du dépôt : ni testé, ni restauré avec lui.
- **B. Une rotation par durée dans ancrage.** Le serveur écrit lui-même des fichiers de journal
  datés, dans un volume, et supprime les anciens. La promesse vit dans le dépôt. Mais le conteneur
  est en lecture seule (`read_only`, avec un `tmpfs` sur `/tmp`) : il faudrait un volume en
  écriture, une dépendance, une purge à tester, et `docker logs` ne serait plus la source unique.
  C'est cher pour un journal dont on veut précisément qu'il ne contienne rien de personnel.
- **C. Retirer la donnée personnelle du journal de l'application, et garder le plafond en
  taille.** Si aucune ligne ne cite une personne, une passkey, un cours, un jeton, une adresse IP
  ni une requête, la durée de conservation cesse d'être un enjeu de vie privée : c'est un journal
  technique. Le plafond existant en borne le volume. Le coût : le journal dit moins, on n'y lit plus
  quel cours ni quelle personne.
- **D. Faire taire l'adresse dans le journal du tunnel** (niveau de journal `fatal`). À notre
  connaissance, la ligne qui porte l'adresse est de niveau erreur, et seul `fatal` la
  supprimerait. Un niveau `fatal` cacherait aussi la plupart des diagnostics du tunnel, qui sont le
  seul signe d'un tunnel malade. On perdrait de quoi exploiter pour retirer une adresse qui,
  à notre connaissance, n'apparaît que quand l'application ne répond pas.

## Décision

**Option C, avec une exception nommée pour le tunnel** (arbitrage 1e-R4).

1. **Le journal de l'application ne porte aucune donnée personnelle.**
   - Une requête s'écrit avec sa méthode et le **modèle de sa route** (`/api/moi/passkeys/:id`).
     Sans route (les écrans du client, un 404), c'est le premier segment suivi de `/…`
     (`/cours/…`, `/invitation/…`, `/api/…`) s'il ressemble à un nom d'écran (minuscules, chiffres
     et tirets, 24 caractères au plus), sinon `/…` ; ou `/` pour la racine. Le premier segment est
     lu décodé, une fois : une autre écriture de l'adresse (`/%69nvitation/…`, `//lien/…`) ne fait
     pas passer un jeton.
   - Jamais une valeur de paramètre, une requête (`?depuis=`), un jeton, une adresse IP, un
     en-tête, un corps, ni un identifiant de personne, de session, de passkey ou de cours, ni un
     curseur.
   - Les autres lignes ne portent que des nombres (la purge), des motifs (un refus
     d'authentification) ou la cause technique d'une erreur.
2. **Un gestionnaire d'erreurs racine.** Une erreur 4xx passe intacte, statut et corps (le refus de
   débit, le 400 d'un corps illisible). Une erreur 5xx, ou sans statut, rend
   `{ "erreur": "interne" }` sans message ; sa cause va au journal, au niveau `error`.
3. **`Referrer-Policy: no-referrer` sur toute réponse**, dans le même esprit : une adresse de
   l'application, `/invitation/<jeton>` comprise, ne part pas vers un autre site.
4. **Le plafond en taille reste** : `json-file`, 3 × 5 Mo par conteneur, l'application et le
   tunnel. Il remplace la « rotation à 14 jours » de l'ADR-0007.
5. **Le tunnel est une exception.** Son journal peut garder l'adresse d'une requête qui n'a pas
   atteint l'application, par exemple pendant un redémarrage. À notre connaissance, l'adresse IP
   de la personne n'y figure pas. Il est plafonné en taille comme le reste. Son niveau de journal
   reste celui par défaut (option D écartée) : un niveau `fatal` cacherait la plupart de ses
   diagnostics.

La notice dit donc : le journal de l'application est technique et sans donnée personnelle ; le
tunnel peut garder l'adresse d'une requête qui n'a pas atteint l'application et, à notre
connaissance, n'y garde pas l'adresse IP de la personne ; les deux sont plafonnés en taille, sans
durée ; Cloudflare garde les siens selon ses règles.

L'ADR-0007 reste en vigueur, à ce seul point près : la durée des journaux.

## Conséquences

- **La notice** n'annonce plus « 14 jours de journaux », et plus aucune durée pour eux. Elle nomme
  l'exception du tunnel (point 5).
- **Une règle pour tout nouveau journal de l'application** : une ligne `log.`, une route ou un
  sérialiseur ne doit écrire aucun des éléments du point 1. Le test `journal_sans_identifiant`
  (`src/serveur/app.test.ts`) garde les lignes de requête, pour des routes portant un identifiant de
  personne, de passkey ou de cours. Il ne garde pas les lignes applicatives : la relecture de chaque
  `log.` reste à la charge de la PR qui l'ajoute.
- **Des lignes internes de Fastify écrivent l'adresse brute**, hors du sérialiseur : l'avertissement
  « Reply was already sent » (une réponse envoyée deux fois, ou une route qui oublie de la
  renvoyer), sous deux formes. Ce sont des chemins de bogue, pas du service normal. On ne les masque
  pas : il faudrait réécrire des messages et des erreurs de Fastify, ce qui est plus fragile que le
  risque. Si l'une apparaît, c'est un bogue à corriger. (La ligne `Route … not found` du 404 de base
  n'est pas atteinte, l'application ayant son propre gestionnaire : vérifié avec un `index.html`
  disparu, Fastify écrit alors une ligne sans adresse.)
- **Coût** : le journal ne dit plus quel cours ni quelle personne a causé une erreur. On retrouve
  la requête par son `reqId` et son heure, puis la cause dans la ligne `erreur interne`. Le
  message d'une erreur 5xx, qui peut citer une table ou un chemin du conteneur, reste dans le
  journal et ne sort plus vers le client.
- **Difficile à changer** : la promesse de la notice. Écrire une donnée personnelle dans le journal
  de l'application obligerait à modifier la notice, à prévenir les personnes et à imposer une
  durée, donc à retenir l'option A ou B.

## Révision

À rouvrir dans cinq cas :

- un journal de l'application doit porter une donnée personnelle (tracer un abus, une enquête) ;
- une obligation ou l'école exige une durée de conservation précise ;
- l'hôte offre une rotation par durée sans coût pour ancrage ;
- le journal du tunnel montre une adresse IP, ou une adresse de requête en dehors d'un redémarrage ;
- l'application s'ouvre au-delà de la classe (même clause que l'ADR-0007).
