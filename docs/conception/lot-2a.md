# Lot 2a — décisions et arbitrages

Le lot 2a (issue ancrage-donnees#115, milestone « Étape 2 — La classe ») fait passer chaque téléphone de lui-même à
la dernière version, dans le navigateur comme dans l'application installée. Il n'y a ni cache à
vider ni application à réinstaller, et jamais de rechargement en pleine séance. Avant lui, une
nouvelle version attendait la fermeture complète de l'application, ce qui n'arrive presque jamais
sur Android.

Ce que le lot a livré :
- **le pied de page dit la révision du code du téléphone** quand elle diffère de celle du serveur
  (`Gerät: <révision>`) ;
- **le service worker prend la main sur demande** d'une page, et une seule fois de lui-même, au
  démarrage du protocole ;
- **`src/client/mise-a-jour.ts`** applique la version au lancement, au retour sur l'application ou
  à une navigation, jamais en pleine séance ;
- **l'écran du cours déclare la séance en cours**, d'après la mémoire de ses onglets
  (`src/client/seance.ts`, `src/client/cours/seances-en-cours.ts`) ;
- **la preuve dans un navigateur** : `corepack pnpm e2e:mise-a-jour`, lancé aussi par le job `image`
  de la CI.

Le plan a été supprimé à la clôture, comme le veut la méthode. Ce document garde, avec leurs
numéros, ce à quoi le code et les tests renvoient :
- les décisions du plan (« 2a-D<n> ») ;
- les arbitrages faits pendant l'exécution (« 2a-R<n> »).

**Le comportement, lui, est fixé par le code et les tests.**

La spécification est l'issue ancrage-donnees#115 : son corps, et son commentaire « Cadrage du 27/10/2026 », approuvé
par Edouard le même jour.

## Les décisions du plan (27/10/2026)

1. **2a-D1, le protocole.** Le service worker n'a toujours ni `clientsClaim` ni `skipWaiting`
   d'office. Il appelle `skipWaiting()` quand une page lui envoie le message
   `'ancrage:prendre-la-main'`. Cette décision remplace la décision 16 du lot 1d.
2. **2a-D2, les moments.** Ils sont trois :
   - **le lancement** : au chargement, une fois le service worker enregistré, si une version
     attend ;
   - **le retour** : quand la page redevient visible. Le client demande aussi au navigateur de
     vérifier s'il existe une nouvelle version (`registration.update()`) ;
   - **la navigation** : à chaque changement d'adresse, par `naviguer` ou par le bouton retour. La
     règle s'évalue après le rendu de la nouvelle adresse, pour qu'un écran de cours quitté ait
     déjà disparu.

   Une version trouvée entre deux moments attend le moment suivant : la page ne se recharge jamais
   sous les yeux en dehors de ces moments. « Appliquer » une version, c'est envoyer le message à la
   version en attente, puis recharger la page à `controllerchange`.
3. **2a-D3, la séance en cours.** L'écran du cours déclare une séance tant qu'un état de la mémoire
   de ses onglets en est une :
   - les Karteikarten : au moins une carte faite, et la file n'est pas vide ;
   - le Quiz, les Wörter, les Schemata, les Übungen : au moins une réponse. Ces séries n'ont pas
     de fin ;
   - la Prüfung : un passage commencé et pas remis ;
   - les Arbeitsblätter : au moins une réponse, et une tâche qui reste. Le lot 2b y ajoute la tâche
     entamée (2b-D5) ;
   - les Berichte : au moins une réponse, terme ou question, et pas encore le bilan (2a-R9).

   Quitter le cours efface sa mémoire : la séance prend fin.
4. **2a-D4, l'absence longue**, validée par Edouard avec le plan et précisée par 2a-R10. Au retour,
   après **30 minutes** ou plus hors de la page, la version s'applique même en séance, si la séance
   est **journalisée** : elle est tenue pour abandonnée. Sans cette règle, une série sans fin
   bloquerait la mise à jour aussi longtemps que l'application reste ouverte sur le cours. On perd
   au plus la question affichée et le score de la série : les réponses données sont dans le
   journal. Une séance **retenue** n'est jamais abandonnée.
5. **2a-D5, la version visible**, validée par Edouard avec le plan. Le pied de page de tous les
   écrans garde la forme `environnement · version · révision`, lue sur le serveur, quand le code du
   téléphone est celui du serveur. Sinon, il ajoute la révision du téléphone :
   `prod · 0.7.3 · e3cf6c2 · Gerät: a577526` (en français : `Appareil : a577526`). Le client connaît
   sa révision à la construction : `REVISION`, `local` par défaut.
6. **2a-D6, le démarrage.** Le premier service worker qui connaît le protocole prend la main dès son
   installation, sans attendre de message : la version d'avant ne sait pas en envoyer. Il ne le
   fait que si une version est active et que le cache-marque `ancrage-protocole-1` n'existe pas
   encore. Il crée ce cache à son activation. Il ne force aucune navigation : la page de l'ancienne
   version garde son code jusqu'à son prochain chargement complet. Vérifié par Edouard sur son
   téléphone, au staging, le 27/10/2026.
7. **2a-D7, les échecs.**
   - Une vérification qui échoue, hors ligne par exemple, est ignorée sans rien afficher.
   - Sans service worker, rien ne se passe.
   - Une page ne se recharge qu'une fois par chargement.
   - Un `controllerchange` que la page n'a pas demandé, parce qu'un autre onglet a appliqué la
     version, ne recharge pas aussitôt : la page se recharge au moment suivant, avec les mêmes
     règles.
8. **2a-D8, la preuve.**
   - Un test de bout en bout à part, `corepack pnpm e2e:mise-a-jour`. Il construit deux clients
     (`REVISION=e2e-a` et `e2e-b`) et les sert l'un après l'autre sur la même origine,
     `http://localhost:3100`.
   - Le retour sur l'application est simulé : Playwright ne cache pas une page sans tête. Les règles
     du retour, l'absence longue comprise, sont tenues par les tests unitaires.
   - La CI lance ce test dans le job `image`.

L'ADR-0008 ne change pas. Son contexte cite la décision 16, mais son choix reste nécessaire : l'API
sert toujours le client de la version précédente, qui existe encore, moins longtemps (séance en
cours, autre onglet, retour arrière).

## Les arbitrages de l'exécution (27/10/2026)

L'exécution s'est faite par sous-agents, en trois PR (ancrage-donnees#125, ancrage-donnees#126, ancrage-donnees#127), avec une revue par
tâche, puis une revue finale de tout le lot. La session a fusionné elle-même chaque PR.

- **2a-R1** : sous vitest, la révision du client est la constante `local` (`vitest.config.ts`).
- **2a-R2** : `corepack pnpm e2e` écarte `**/mise-a-jour/**` ; ce test a sa propre configuration.
- **2a-R3** : l'écran du cours déclare sa séance dans un `useLayoutEffect`, et non un `useEffect`.
  Sous Preact 11, un `useEffect` démonté n'est retiré qu'après l'affichage suivant : la navigation
  qui quitte le cours voyait encore la séance.
- **2a-R4** : une registration illisible (`getRegistration` rejeté) compte comme absente : rien ne
  se passe.
- **2a-R5** : au retour, la règle s'évalue aussitôt, sur la version qui attend déjà. `update()` est
  lancé ensuite, sans être attendu. Il se résout dès que la version trouvée s'installe, avant
  qu'elle n'attende : l'attendre n'apportait rien. Sur un réseau lent, cette attente faisait aussi
  recharger tard, par-dessus une séance reprise.
- **2a-R6** : le lancement relit la séance, comme les deux autres moments. Un `controllerchange`
  demandé relit la séance par la règle du moment qui a fait la demande, avec son absence : une
  séance commencée depuis reporte le rechargement, et une séance tenue pour abandonnée après une
  absence longue ne le reporte pas.
- **2a-R7** : une prise de main qui arrive plus de 5 s après la demande
  (`DELAI_DE_PRISE_DE_MAIN_MS`) compte comme non demandée : la page se recharge au moment permis
  suivant. C'est la garantie de 2a-D2, quelle que soit la cause du retard (voir « Les mesures »).
- **2a-R8** : à son installation, le service worker pose une route statique (`addRoutes`, Chrome 123
  et suivants) qui envoie `/api/*` au réseau sans le réveiller. Ailleurs, 2a-R7 garde la garantie.
- **2a-R9** : les Berichte déclarent une séance. Le plan les avait oubliés en 2a-D3, alors que seul
  leur bilan va au journal : un retour en plein Bericht perdait tout le texte.
- **2a-R10** : une séance a un genre. Une séance **journalisée** a ses réponses au journal à mesure :
  ce sont les séries, les cartes et les fiches. Une séance **retenue** n'a les siennes au journal
  qu'à la fin : la Prüfung à sa remise, un Bericht à son bilan. 2a-D4 n'abandonne qu'une séance
  journalisée. Sa prémisse, « les réponses données sont dans le journal », est fausse pour une
  séance retenue, et sa raison, « une série sans fin », ne la touche pas. Une séance retenue garde
  donc la version en attente jusqu'à la remise, au bilan, à la sortie du cours ou au lancement
  suivant. Cela évite aussi une course : sans cela, un examen chronométré dont le temps s'est écoulé
  pendant l'absence est remis au retour, et le rechargement pouvait en perdre le résultat.

## Les mesures

- **Une requête de l'API en vol** au moment de la demande, typiquement `/api/cours` à l'ouverture
  d'un écran, réveillait l'ancien service worker. Chromium n'activait alors la nouvelle version
  qu'après 30 s d'inactivité de l'ancien. La page se rechargeait 31 s après la navigation, contre
  1,1 s sans requête en vol (mesuré hors Playwright, trois fois sur trois). D'où 2a-R7 et 2a-R8.
- **En prod**, la première mise à jour par message sera « cette version → la suivante » : le service
  worker actif aura déjà la route statique. Le cas lent n'a touché que le staging, au passage de la
  PR 2 à la PR 3.

## Les suites

- **Un retour arrière qui franchit le protocole.** Après `deployer.sh prod --retour` d'une version
  du lot 2a vers la v0.7.2 ou une version plus ancienne, deux effets :
  - le service worker de la v0.7.2 ignore le message, et un téléphone reste sur le nouveau client
    jusqu'à une fermeture complète ;
  - un téléphone dont le service worker de la v0.7.2 redevient actif garde la marque
    `ancrage-protocole-1`. À la remontée suivante, le nouveau service worker voit la marque, et ne
    prend pas la main au démarrage ; le client de la v0.7.2 ne sait pas envoyer le message. On
    retombe alors, pour ce téléphone, dans le défaut de ancrage-donnees#115.

  **Remède** : la version qui suit un tel retour passe `CACHE_PROTOCOLE` à `ancrage-protocole-2`
  (`src/client/sw-protocole.ts`). Voir `docs/exploitation.md`, « Après un retour arrière ».
- **Les remarques mineures de la revue finale**, à reprendre au prochain passage (ancrage-donnees#81). Le lot 2b
  les a toutes réglées (2b-D5, dans `docs/conception/lot-2b.md`) :
  - un rechargement à la sortie du cours coupe souvent l'envoi des réponses lancé à cette sortie.
    Rien n'est perdu : la file part au prochain écran de cours ;
  - une déconnexion ou une suppression de compte en cours n'est pas protégée d'un rechargement,
    dans les 5 s qui suivent une navigation ;
  - une fiche dont la première tâche est à moitié remplie n'est pas une séance : un retour perd la
    saisie de cette tâche ;
  - les replis de la route statique n'ont ni test ni trace ; les écouteurs `install`, `activate` et
    `message` du service worker ne sont prouvés que de bout en bout ;
  - l'enchaînement « chrono de la Prüfung écoulé pendant une absence longue, remise au retour, puis
    version appliquée au moment suivant » n'est prouvé que par lecture du code.
- **👤 La vérification au staging** : en séance, avec une version en attente, aller au compte
  recharge aussitôt ; hors séance, revenir sur l'application ou naviguer applique la version ; un
  Bericht commencé la retient jusqu'à son bilan.
- **👤 L'étiquette**, avec l'accord d'Edouard. Puis la même vérification en prod. Enfin, Edouard
  prévient l'apprenante : l'application se met désormais à jour d'elle-même, parfois par un court
  rechargement, jamais en pleine séance. Si l'ancienne version reste affichée après un lancement,
  elle ferme l'application une fois.
