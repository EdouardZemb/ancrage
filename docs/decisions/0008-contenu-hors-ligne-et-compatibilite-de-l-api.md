# ADR-0008 — Hors-ligne : le contenu des cours dans IndexedDB, et une API qui sert aussi le client de la version précédente

- **Statut** : accepté le 2026-10-18
- **Contexte amont** : ADR-0004 (hors-ligne), ADR-0001 (invariant 3), ADR-0006 (invariant 8),
  issue ancrage-donnees#5 (lot 1d) ; décisions 11 et 16 et rulings R18, R21, R32 et R36 du lot 1d
  (`docs/conception/lot-1d.md`)

## Contexte

Deux questions sont nées de la mise en œuvre du hors-ligne au lot 1d.

**Où garder le contenu des cours sur le téléphone.** L'ADR-0004 dit : « Le service worker met en
cache l'application et le contenu des cours autorisés ». Or l'invariant 3 veut que le contenu ne
sorte que par l'API, après contrôle des droits, et jamais comme fichier statique. Le cache d'un
service worker range les réponses par adresse. Il ne sait rien de la personne connectée, et il
resservirait un contenu sans aucun contrôle, y compris à une autre personne sur un téléphone
partagé.

**Quel serveur parle à quel client.** L'application installée est précachée, et le nouveau
service worker attend la fermeture de l'application, sans `skipWaiting` (décision 16). Le client
qui tourne a donc souvent une version de retard sur le serveur :
- après une mise en ligne, l'ancien client sert jusqu'à la fermeture de l'application ;
- après un retour arrière (`deployer.sh --retour`), le client plus récent reste en place. La
  v0.3.0, par exemple, n'a pas de `sw.js` : la mise à jour du service worker échoue, et le client
  v0.4 continue de servir.

L'invariant 8 protège déjà la base, `compose.yml` et les `env/*.env` contre ce décalage. Il ne
disait rien de l'API.

## Options

**Pour le contenu :**

- **A. Mettre en cache les réponses de l'API dans le service worker** (une route d'exécution
  Workbox sur `GET /api/cours/:id`). C'est la lettre de l'ADR-0004 et c'est simple. Mais le cache
  n'est pas partagé par personne, il sert sans contrôle, et la déconnexion doit penser à le
  vider.
- **B. Ranger le contenu dans IndexedDB, par personne**, après une lecture de l'API contrôlée par
  le serveur. Le service worker ne précache que l'application. Le stockage est séparé par
  personne, se vide personne par personne, et le précache ne contient aucun texte de cours. Le
  coût : le code du stockage local, et un client qui doit supporter un contenu de forme
  inattendue.

**Pour la compatibilité :**

- **C. Une API versionnée** (`/api/v2/…`). C'est trop lourd pour une application qui n'a qu'un
  client, le sien.
- **D. La règle de l'invariant 8, étendue à l'API** : on ajoute avant d'enlever, avec en plus un
  client qui vérifie la forme de ce qu'il range.

## Décision

**Options B et D.**

1. **Le contenu hors-ligne vit dans IndexedDB.**
   - Il est rangé par personne, avec la liste de ses cours, après une lecture par l'API.
   - Le service worker ne précache que l'application, qui ne contient aucun texte de cours.
     `contenus:client` examine tout le client construit, `sw.js` compris. Le service worker n'a
     aucune route d'exécution, et `/api/` est exclu de sa route des navigations.
   - `GET /api/cours/:id` et les routes du journal répondent avec `cache-control: no-store`.

   Cet ADR précise l'ADR-0004 sur ce seul point : l'intention reste (le contenu des cours
   autorisés est disponible hors ligne), seul le mécanisme change.
2. **L'API sert aussi le client de la version précédente.**
   - Une route ou un champ de réponse ne s'enlève qu'une version plus tard. Il en va de même pour
     un en-tête qu'on rendrait obligatoire sur une route existante. C'est l'invariant 8, étendu à
     l'API dans `CLAUDE.md`.
   - Un contrôle nouveau sur une route existante ne joue que si le client envoie le nouvel
     en-tête. Exemple : `x-ancrage-personne` sur `GET /api/cours` et `GET /api/cours/:id` (R36).
   - Une route nouvelle peut exiger son en-tête dès sa première version, comme les routes du
     journal (R21, R32), puisqu'aucun client précédent ne l'appelle.
3. **Le client supporte un serveur de la version précédente.**
   - Un contenu lu, sur le réseau ou dans IndexedDB, est contrôlé dans sa forme avant d'être rangé
     et affiché (`coursServiUtilisable`). S'il est refusé, la copie locale reste. Sans copie
     utilisable, l'écran dit que le cours est indisponible.
   - Un 404 ne fait oublier un cours que si `GET /api/cours` le confirme (R18). Cette route existe
     dans toutes les versions.

## Conséquences

- **Le contenu d'un cours n'entre dans aucun cache HTTP ni dans le cache du service worker.** La
  déconnexion vide IndexedDB, sauf les files d'envoi non vides. Elle vide aussi les caches et
  désinscrit le service worker, puis recharge la page.
- **Coût** : le module de stockage local et le contrôle de forme. Chaque PR qui touche l'API a
  aussi une règle de plus à respecter.
- **Retour arrière vers une version sans service worker** : le client précaché reste. Il garde sa
  copie locale, et les réponses attendent dans la file jusqu'au retour en avant. Pendant ce
  temps, la déconnexion est refusée si la file n'est pas vide (`docs/exploitation.md`).
- **Difficile à changer** :
  - le rangement par personne dans IndexedDB, dont le schéma n'évolue que par une montée de
    version de la base locale ;
  - la règle de compatibilité, qui doit tenir à chaque version.

## Révision

À rouvrir dans deux cas :
- si un contenu lourd (images, son) rend IndexedDB inadapté ;
- si l'API doit casser sa compatibilité. On passerait alors à une API versionnée.
