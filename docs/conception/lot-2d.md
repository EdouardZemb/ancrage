# Lot 2d — décisions et arbitrages

Le lot 2d (issue ancrage-donnees#85, milestone « Étape 2 — La classe ») a fait la seule mise à jour de la notice
de confidentialité avant l'ouverture du cours à la classe (ancrage-donnees#9, 1f-D2). Pour l'apprenante, qui utilise la
prod depuis le 18/10/2026, seule la notice change. Le lot a livré :
- **le serveur** (ancrage-donnees#166) : sans session, le module `acces` répond `401 {"erreur":"compte_supprime"}`
  à un appareil dont l'en-tête `x-ancrage-personne` nomme un compte du registre des suppressions ;
- **le client** (ancrage-donnees#167) : quand la session d'une personne expire, l'application demande si son
  compte est supprimé. Si oui, elle vide l'appareil et recharge la page sur l'écran de connexion,
  qui le dit ;
- **la notice** (ancrage-donnees#168) : cinq passages, en français et en allemand, et `NOTICE_VERSION` au
  `2026-11-03` ;
- **la revue finale** (ancrage-donnees#169) : le texte sous « Supprimer mon compte », deux cas où l'effacement ne
  recharge pas, et une phrase allemande de la notice.

Il part en `v0.9.0`, avec la dérogation de diffusion (ancrage-donnees#163) et la limite de connexion (ancrage-donnees#164).

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« 2d-D<n> ») ;
- les arbitrages faits pendant l'exécution (« 2d-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** La spécification est le commentaire « Cadrage du 02/11/2026 » de ancrage-donnees#85.

## Les décisions du plan (02/11/2026)

Edouard a pris les défauts des neuf questions du cadrage, puis a validé le plan (ancrage-donnees#165), le
02/11/2026. Quand un arbitrage en a précisé une, la ligne le dit.

1. **2d-D1, le périmètre** : celui du cadrage. Trois choses restent hors du lot :
   - le texte 25 (`stockage_en_echec`, ancrage-donnees#80) ;
   - les réponses en attente d'une autre personne sur un téléphone partagé (R33) ;
   - le service worker, qui ne s'efface pas de lui-même. La page le fait à sa prochaine ouverture.
2. **2d-D2, la réponse du serveur** :
   - le module `acces` reste le seul à refuser (invariant 2) ;
   - l'en-tête n'est lu que sans session. Une session valide l'emporte toujours, même si l'en-tête
     nomme un compte supprimé (un téléphone partagé) ;
   - un en-tête absent, vide ou répété ne nomme aucun compte du registre : `non_connecte` ;
   - les routes publiques ne changent pas ;
   - la réponse ne dit qu'une chose : cet identifiant aléatoire appartient à un compte supprimé
     depuis moins de 100 jours (la purge du registre, 1e-D3). Elle ne dit rien d'un cours
     (invariant 1).
3. **2d-D3, un `non_connecte` marqué, pas un code de plus** : c'est un écart avec le cadrage, au
   même comportement.
   - Le cadrage faisait entrer `compte_supprime` dans `CODES_DU_SERVEUR`. Chaque contrôle
     `code === 'non_connecte'` aurait alors changé de sens :
     - l'envoi avant la déconnexion (cause `session`) ;
     - la synchronisation (`reconnexion`) ;
     - `lireMoi` ;
     - `sessionPerdue`.
   - Le code reste donc `non_connecte`. `ErreurApi` gagne un drapeau, `compteSupprime`, vrai pour
     un `401 {"erreur":"compte_supprime"}`. `erreurDeLaReponse` remplace `codeDeLaReponse`.
4. **2d-D4, une seule porte de détection, la session expirée** : c'est un écart avec le cadrage, au
   même comportement.
   - Le cadrage détectait la suppression dans `resoudreSession` et dans la synchronisation. Les deux
     mènent déjà à l'état `expiree`.
   - L'application vérifie donc là seulement, par `compteSupprime(personne)`, qui envoie
     `GET /api/moi` avec l'en-tête.
   - `resoudreSession`, `lireMoi` et la synchronisation ne changent pas. Cela coûte un appel de plus
     quand une session expire.
5. **2d-D5, l'effacement** : c'est celui de `supprimerLeCompte` à partir de son étape 3, mis en
   commun dans `effacerApresSuppression`, sous `avecSynchronisationsSuspendues`.
   - Tout est effacé, file comprise.
   - Si le stockage refuse, l'appareil oublie quand même la personne, et le résultat est `incomplet`.
   - Le signal des passkeys est attendu 2 s au plus.
   - Une fois l'appareil effacé, la page se recharge, même si l'écran a changé entre-temps.
     2d-R4 et 2d-R5 y font deux exceptions.
6. **2d-D6, l'écran de connexion** :
   - l'adresse gagne la variante `?compte=supprime&appareil=vide`, qui dit « Ton compte a été
     supprimé. Cet appareil a été vidé. » (« Dein Konto wurde gelöscht. Dieses Gerät wurde
     geleert. ») ;
   - un effacement incomplet garde `appareil=non_efface` (1e-R14) ;
   - une seule fonction écrit les trois adresses : `adresseApresSuppression`, dans `Connexion.tsx`,
     à côté de celle qui les lit.
7. **2d-D7, la notice** : les cinq passages de ancrage-donnees#168, en français et en allemand. `NOTICE_VERSION`
   prend la date de fusion de la PR qui la change. 2d-R6 a repris une phrase allemande le même jour.
8. **2d-D8, la version** : `v0.9.0`, avec l'accord d'Edouard. Elle emporte aussi ancrage-donnees#163 et ancrage-donnees#164.
   Un message court pour l'apprenante, en français, attend dans la boîte de réception d'Edouard.

## Le relevé de la mutation (02-03/11/2026)

En CI (ancrage-donnees#166), la passe complète compte 753 mutants, à 98,05 %. `suppression.ts` est à 100 % (59
mutants). `acces/index.ts` est à 96,38 % (133 mutants : 4 survivants, 1 sans couverture). Le job
`mutation` a pris 18 min 41 s, pour un délai de 20 minutes : c'est une suite du lot (ancrage-donnees#156).

Un seul mutant nouveau survit :
- **`index.ts:135`**, `typeof nomme === 'string' &&` devenu `true &&` : équivalent. Node joint un
  en-tête répété en une seule chaîne, « a, b », que le registre ne connaît pas. `light-my-request`,
  dans les tests, fait de même. La garde ne sert qu'au typage, `string | string[] | undefined`.

Les trois autres survivants et le mutant sans couverture sont ceux du lot 2c, décalés par les
lignes ajoutées (`docs/conception/lot-2c.md`, « Le relevé de la mutation ») : `index.ts:170`,
`:205`, `:207` et `:116`.

## Les arbitrages de l'exécution (02-03/11/2026)

- **2d-R1, le test de la déconnexion** : le plan faisait recevoir `compte_supprime` à
  `POST /api/auth/deconnexion`. Or cette route est publique, et elle ne lit jamais l'en-tête. Le
  test vérifie donc l'envoi de la file qui précède la déconnexion : un 401 `compte_supprime` du
  journal donne la même déconnexion qu'un 401 `non_connecte`. C'est
  `envoi_avant_deconnexion_401_compte_supprime_comme_non_connecte`.
- **2d-R2, l'en-tête répété** : `app.inject` accepte `[id, id]`, et le test l'envoie tel quel.
  `estSupprimee(base, 'id, id')` tient en plus la valeur jointe que Node produirait.
- **2d-R3, pas de contrôle `nomme !== ''`** : une chaîne vide ne trouve rien dans le registre. Le
  contrôle laissait deux mutants équivalents : il est retiré.
- **2d-R4, pas de rechargement en boucle** (revue finale) :
  - **Le cas** : le stockage lit encore, mais refuse d'écrire. L'effacement échoue, et l'oubli de la
    personne aussi.
  - **La boucle** : après le rechargement, la session redevient `expiree`, et l'effet rechargeait
    la même adresse, sans fin.
  - **La règle** : l'effet ne recharge pas quand l'adresse courante est déjà celle que rend
    `adresseApresSuppression`. L'écran de connexion garde son message, et l'effacement est retenté
    à chaque ouverture.
- **2d-R5, un lien d'invitation ou de secours ne se perd pas** (revue finale) :
  - **Le cas** : un appareil qui connaît encore un compte supprimé ouvre `/invitation/<jeton>` ou
    `/lien/<jeton>`. C'est le cas d'une nouvelle invitation après une suppression, ou d'une autre
    personne sur un téléphone partagé.
  - **La règle** : l'appareil se vide sans recharger. Un rechargement aurait perdu le lien.
- **2d-R6, le texte sous « Supprimer mon compte »** (revue finale) : il disait encore de se
  déconnecter d'abord de chaque appareil. Le plan l'avait oublié. Il dit maintenant, comme la
  notice, que les autres appareils se vident à leur prochain contact, dans les 100 jours. Dans le
  même passage, une phrase allemande de la notice prêtait à confusion : « danach » pouvait se lire
  « après s'être vidés ». Elle devient « Erreichen sie ihn erst später, behalten sie ihre Kopie… ».
  Le français, qui fait foi, ne change pas. `NOTICE_VERSION` non plus : la PR a fusionné le même
  jour.
- **2d-R7, le registre gagne un usage, sans nouvel ADR** : l'ADR-0007, §2, ne donne au registre
  que le rejeu après une restauration.
  - Le cadrage (décision 5) a voulu ce second usage : faire vider les autres appareils. Il a voulu
    aussi que la notice le dise, et elle le dit.
  - La donnée ne change pas : un identifiant opaque et une date, 100 jours.
  - Un ADR ne se réécrit pas. Celui-ci reste juste, et ce document le complète.
- **2d-R8, l'en-tête du squash de ancrage-donnees#167** : le titre de la PR, suivi du numéro de la PR entre parenthèses que GitHub
  ajoute (sept caractères, espace compris), faisait 104 caractères.
  - La CI de `main` a échoué sur ce commit, et son image n'a pas été construite. Celle du commit
    suivant a tout déployé au staging.
  - Le socle contrôle le titre et les commits de la branche, pas l'en-tête du squash.
  - L'en-tête de `main` ne se réécrit pas.
  - La leçon est au registre (LE-12).
- **2d-R9, la relecture de l'allemand** (03/11/2026, après la clôture) : à la demande d'Edouard,
  Codex a relu les sept passages allemands du lot contre le français : les cinq de la notice, et
  les deux de l'interface. La session a vérifié chacune de ses remarques.
  - Quatre passages sont conformes, dont le texte de suppression et le message de l'écran de
    connexion.
  - Une remarque est retenue. Dans « bittet die App den Browser …, ihn zu entfernen », « ihn »
    pouvait renvoyer à « Anzeigenamen », le dernier nom masculin de la phrase d'avant. Le
    français, « la retirer », n'a pas cette ambiguïté. Le pronom devient « den Passkey ».
    `NOTICE_VERSION` ne change pas : la PR a fusionné le même jour.
  - Deux remarques sont écartées. La puce des droits ne dit pas les 100 jours : le français non
    plus, et tous deux renvoient à « Sur ton téléphone ». La phrase sur le rejeu à la main dit la
    même chose que le français.
  - Le même jour, la participation de Cloudflare et de Google au Data Privacy Framework est
    revérifiée.

## Les limites

- **Une sonde sans session** apprend une seule chose : tel identifiant aléatoire est celui d'un
  compte supprimé depuis moins de 100 jours (2d-D2). Cet identifiant n'est connu que des appareils
  de la personne et de l'administration.
- **Un appareil qui ne joint le serveur qu'après 100 jours** n'est plus reconnu. Il garde sa copie
  jusqu'à ce qu'on s'y déconnecte, et la notice le dit (décision 2 du cadrage).
- **Un téléphone partagé** où une autre personne a une session valide ne se vide pas du compte
  supprimé : une session valide l'emporte (2d-D2). C'est le terrain de R33.
- **Un onglet resté ouvert**, en session expirée, sur un compte supprimé ensuite, ne revérifie qu'à
  sa prochaine ouverture.
- **Après une restauration faite pour annuler une suppression**, les autres appareils ont pu se
  vider entre-temps, réponses en attente comprises. C'est la décision 3 du cadrage.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-12, l'en-tête du squash (2d-R8).
- **Dans « Au prochain passage » (ancrage-donnees#156)** :
  - la durée du job `mutation`, 18 min 41 s pour un délai de 20 minutes ;
  - les remarques mineures des revues, gardées pour un passage ultérieur.
- **Avant la `v0.9.0`** :
  - fait le 03/11/2026 : la relecture de l'allemand de la notice et du texte de suppression
    (2d-R9), et la participation de Cloudflare et de Google au Data Privacy Framework
    (`docs/exploitation.md`, « La notice de confidentialité ») ;
  - 👤 reste la vérification sur Android, au staging.
- **👤 Après la `v0.9.0`** : le message à l'apprenante.
