import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { ReponseSante } from '../domaine/sante.js';
import { lireMoi, listerCours, type Moi } from './api.js';
import { LienInterne, MessageErreur, Rattrapage } from './composants.js';
import { ContexteApp, useApp, useChargement } from './contexte.js';
import { EcranCours } from './cours/EcranCours.js';
import { Admin } from './ecrans/Admin.js';
import { Appareils } from './ecrans/Appareils.js';
import { Compte } from './ecrans/Compte.js';
import { Confidentialite } from './ecrans/Confidentialite.js';
import { adresseApresSuppression, Connexion } from './ecrans/Connexion.js';
import { Invitation } from './ecrans/Invitation.js';
import { Lien } from './ecrans/Lien.js';
import { sessionPerdue } from './erreurs.js';
import { chargerNotice } from './notice-locale.js';
import { signalerNom } from './passkeys-signal.js';
import { demanderLaPersistance } from './persistance.js';
import {
  destinationDeLAccueil,
  naviguer,
  type Route,
  rechargerSur,
  redirection,
  route,
  useChemin,
  type Visiteur,
} from './routeur.js';
import { lireSante } from './sante.js';
import {
  adopterPersonne,
  type EtatSession,
  memoriserMoi,
  resoudreSession,
  verifierLaSuppression,
} from './session-locale.js';
import { baseDeLaPage } from './stockage/base-de-la-page.js';
import type { BaseLocale } from './stockage/base-locale.js';
import { enregistrerListe, listeLocale } from './stockage/cours-local.js';
import { langueDuNavigateur, textes } from './textes.js';
import { REVISION_CLIENT, texteDeVersion } from './version.js';

type EtatSante =
  | { etat: 'chargement' }
  | { etat: 'erreur' }
  | { etat: 'pret'; sante: ReponseSante };

/**
 * Ce que l'on sait du visiteur pour le choix des écrans. Hors ligne ou en session expirée, la
 * personne connue de l'appareil garde ses écrans : elle révise (décision 14).
 */
function visiteurDe(session: EtatSession): Visiteur {
  switch (session.etat) {
    case 'chargement':
    case 'injoignable':
      return 'inconnu';
    case 'anonyme':
      return 'anonyme';
    case 'connecte':
    case 'hors_ligne':
    case 'expiree':
      return session.moi.proprietaire ? 'proprietaire' : 'connecte';
  }
}

/** La session après un 401 : la personne connue continue, en session expirée. */
function apresUneSessionPerdue(avant: EtatSession): EtatSession {
  return 'moi' in avant ? { etat: 'expiree', moi: avant.moi } : { etat: 'anonyme' };
}

/** La base locale de la page, ou `undefined` si IndexedDB ne s'ouvre pas. */
function baseSiPossible(): Promise<BaseLocale | undefined> {
  return baseDeLaPage().catch(() => undefined);
}

/**
 * La mise en page de tous les écrans : en tête, le titre `ancrage` et, pour une personne connectée,
 * le lien vers son compte ; puis, hors ligne ou en session expirée, un bandeau qui le dit ; en pied
 * de page, le lien vers la notice de confidentialité (1e-D15), puis
 * `environnement · version · révision`, que l'exploitation et le test de bout en bout lisent ; quand
 * le code du téléphone n'est pas celui du serveur, s'y ajoute `Gerät: <révision>` (2a-D5).
 *
 * L'écran est sous un `Rattrapage` (1e-D13) : si son rendu échoue, l'en-tête, le bandeau et le pied
 * de page restent, avec le message, « Recharger » et, hors de l'accueil, « ← Accueil » (1f-D11) à
 * la place de l'écran.
 */
function MiseEnPage(props: {
  serveurInjoignable: string;
  /** Le modèle du texte de la révision du téléphone, avec `{revision}` (2a-D5). */
  versionAppareil: string;
  /** Le libellé du lien vers le compte ; pas de lien sans personne connectée. */
  lienCompte: string | undefined;
  /** Le libellé du lien vers la notice de confidentialité, sur tous les écrans. */
  lienNotice: string;
  bandeau: ComponentChildren;
  /** La clé du filet de l'écran : un autre écran le remet à neuf (`cleDuFiletDEcran`). */
  cleEcran: string;
  ecranEnErreur: string;
  recharger: string;
  /** Le libellé du lien vers l'accueil, au filet ; `undefined` sur l'accueil lui-même (1f-D11). */
  lienAccueil: string | undefined;
  children: ComponentChildren;
}) {
  const [sante, setSante] = useState<EtatSante>({ etat: 'chargement' });

  useEffect(() => {
    let actif = true;
    lireSante().then(
      (lue) => {
        if (actif) {
          setSante({ etat: 'pret', sante: lue });
        }
      },
      () => {
        if (actif) {
          setSante({ etat: 'erreur' });
        }
      },
    );
    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    // La notice de l'instance, au démarrage comme la santé : l'appareil en range la copie, pour la
    // lire hors ligne (S1-D8). Sans attendre, et sans bruit : `chargerNotice` ne lève pas.
    void baseSiPossible().then((base) => chargerNotice(base));
  }, []);

  let version: string;
  switch (sante.etat) {
    case 'chargement':
      version = '…';
      break;
    case 'erreur':
      version = props.serveurInjoignable;
      break;
    case 'pret':
      version = texteDeVersion(sante.sante, REVISION_CLIENT, props.versionAppareil);
      break;
  }

  return (
    <>
      <header class="app">
        <h1>ancrage</h1>
        {props.lienCompte !== undefined && (
          <LienInterne vers="/compte">{props.lienCompte}</LienInterne>
        )}
      </header>
      <main>
        {props.bandeau}
        <Rattrapage
          key={props.cleEcran}
          message={props.ecranEnErreur}
          libelleRecharger={props.recharger}
          lienAccueil={props.lienAccueil}
        >
          {props.children}
        </Rattrapage>
      </main>
      <footer>
        <p>
          <LienInterne vers="/confidentialite" class="lien-notice">
            {props.lienNotice}
          </LienInterne>
        </p>
        <p data-testid="version">{version}</p>
      </footer>
    </>
  );
}

/**
 * L'accueil (`/`) de `personne` : il lit la liste des cours, la range pour le hors-ligne, puis mène
 * au cours s'il n'y en a qu'un, au compte sinon (`destinationDeLAccueil`). Sans réseau, ou la
 * session expirée ou d'une autre personne, il prend la liste gardée sur l'appareil (R23) : on
 * révise hors ligne. C'est une redirection : l'adresse est remplacée, le bouton « retour » ne la
 * retrouve pas.
 *
 * La lecture nomme la personne sous laquelle la liste sera rangée (R36) : si la session est celle
 * d'une autre, le serveur ne rend rien, rien n'est rangé, et l'application passe en reconnexion.
 */
function Accueil(props: { personne: string }) {
  const { personne } = props;
  const { t, definirMoi } = useApp();
  const liste = useChargement(async () => {
    const base = await baseSiPossible();
    try {
      const lue = await listerCours(personne);
      if (base !== undefined) {
        // La liste rangée sert hors ligne ; ne pas pouvoir la ranger n'empêche pas d'avancer.
        await enregistrerListe(base, personne, lue).catch(() => {});
      }
      return lue;
    } catch (echec) {
      const locale =
        base === undefined ? undefined : await listeLocale(base, personne).catch(() => undefined);
      if (locale === undefined) throw echec;
      if (sessionPerdue(echec)) definirMoi(undefined);
      return locale;
    }
  });

  const cible = liste.donnees === undefined ? undefined : destinationDeLAccueil(liste.donnees);
  useEffect(() => {
    if (cible !== undefined) {
      naviguer(cible, { remplacer: true });
    }
  }, [cible]);

  if (liste.erreur !== undefined) {
    return (
      <>
        <MessageErreur message={liste.erreur} />
        <button type="button" class="secondaire" onClick={() => liste.recharger()}>
          {t.reessayer}
        </button>
      </>
    );
  }
  return <p>{t.chargement}</p>;
}

/**
 * La clé du filet de l'écran (1e-D13) : elle change avec l'écran, pas d'un onglet du cours à
 * l'autre. L'onglet a son propre filet (`CoursOuvert`) ; remettre à neuf tout l'écran du cours à
 * chaque onglet le ferait relire et perdrait la mémoire de ses onglets.
 */
function cleDuFiletDEcran(ecran: Route): string {
  switch (ecran.ecran) {
    case 'cours':
      return `cours/${ecran.cours}`;
    case 'invitation':
    case 'lien':
      return `${ecran.ecran}/${ecran.jeton}`;
    // Sans `default` : un écran ajouté à `Route` doit dire ici sa clé, et `types` échoue tant qu'il
    // ne le fait pas.
    case 'accueil':
    case 'compte':
    case 'connexion':
    case 'appareils':
    case 'admin':
    case 'confidentialite':
      return ecran.ecran;
  }
}

function Ecran(props: { ecran: Route }) {
  const { ecran } = props;
  const { moi } = useApp();
  switch (ecran.ecran) {
    case 'accueil':
      // Un écran qui demande une session ne s'affiche qu'à une personne connue (`redirection`).
      return moi === undefined ? null : <Accueil personne={moi.id} />;
    case 'compte':
      return <Compte />;
    case 'cours':
      // La personne fait partie de la clé : rien de ce qui a été lu pour une autre ne reste à
      // l'écran, ni ne s'écrit après elle.
      return (
        <EcranCours key={`${moi?.id}/${ecran.cours}`} cours={ecran.cours} onglet={ecran.onglet} />
      );
    case 'connexion':
      return <Connexion />;
    case 'invitation':
      return <Invitation key={ecran.jeton} jeton={ecran.jeton} />;
    case 'lien':
      return <Lien key={ecran.jeton} jeton={ecran.jeton} />;
    case 'appareils':
      return <Appareils />;
    case 'admin':
      return <Admin />;
    case 'confidentialite':
      return <Confidentialite />;
  }
}

export function App() {
  const chemin = useChemin();
  const [session, setSession] = useState<EtatSession>({ etat: 'chargement' });
  // Chaque essai relit la session : « Erneut versuchen », le retour du réseau.
  const [essai, setEssai] = useState(0);

  const actualiserMoi = useCallback(async () => {
    const moi = await lireMoi();
    if (moi === undefined) {
      setSession(apresUneSessionPerdue);
      return undefined;
    }
    // Avant d'afficher quoi que ce soit pour elle : l'appareil est à elle (décision 12). Un échec
    // du stockage est signalé (R35).
    const reservee = await adopterPersonne(await baseSiPossible(), moi);
    setSession(
      reservee ? { etat: 'connecte', moi } : { etat: 'connecte', moi, stockageEnEchec: true },
    );
    // L'appareil garde maintenant la file de cette personne : on demande qu'il ne l'efface pas
    // (1e-D12). Sans attendre, et sans bruit.
    void demanderLaPersistance();
    // Le téléphone apprend le nom que portent ses passkeys (1e-D6). Sans attendre, et sans bruit.
    void signalerNom(moi);
    return moi;
  }, []);
  const definirMoi = useCallback((moi: Moi | undefined) => {
    if (moi === undefined) {
      setSession(apresUneSessionPerdue);
      return;
    }
    // L'alerte de stockage dit l'état de l'appareil pour la session : elle reste.
    setSession((courante) =>
      courante.etat === 'connecte' ? { ...courante, moi } : { etat: 'connecte', moi },
    );
    // Son nom ou sa langue ont changé : l'appareil s'en souvient pour démarrer hors ligne.
    void baseSiPossible().then((base) => base && memoriserMoi(base, moi).catch(() => {}));
  }, []);
  const fermerSession = useCallback(() => setSession({ etat: 'anonyme' }), []);

  useEffect(() => {
    let actif = true;
    void (async () => {
      const resolue = await resoudreSession(await baseSiPossible(), () => lireMoi());
      if (!actif) return;
      setSession(resolue);
      // Une personne que l'appareil connaît, en ligne ou non : sa file y est (1e-D12). Redemandé à
      // chaque relecture de la session, sans effet si le navigateur a déjà accordé la persistance.
      if ('moi' in resolue) void demanderLaPersistance();
    })();
    return () => {
      actif = false;
    };
  }, [essai]);

  // La seule porte de détection d'un compte supprimé depuis un autre appareil : la session
  // expirée, au démarrage comme en séance (2d-D4). Si le serveur le dit, l'appareil s'efface, puis
  // la page se recharge, sans regarder si l'écran a changé entre-temps : ce qui est effacé ne se
  // défait pas (2d-D5). Deux exceptions, où elle ferme seulement la session :
  // - sur une invitation ou un lien de secours, le rechargement perdrait le lien ;
  // - déjà sur l'adresse que rendrait le rechargement (effacement incomplet), il ferait une boucle ;
  //   l'effacement sera retenté à la prochaine ouverture.
  const expireePour = session.etat === 'expiree' ? session.moi.id : undefined;
  useEffect(() => {
    if (expireePour === undefined) return;
    void (async () => {
      const effacement = await verifierLaSuppression(await baseSiPossible(), expireePour);
      if (effacement === undefined) return;
      fermerSession();
      const adresse = adresseApresSuppression(effacement, true);
      const ecranDuLien = ['invitation', 'lien'].includes(route(location.pathname).ecran);
      if (ecranDuLien || location.pathname + location.search === adresse) return;
      rechargerSur(adresse);
    })().catch(() => {});
  }, [expireePour, fermerSession]);

  // Sans réseau, son retour relit la session : le bandeau disparaît, la session reprend.
  const sansReseau = session.etat === 'hors_ligne' || session.etat === 'injoignable';
  useEffect(() => {
    if (!sansReseau) return;
    const relire = () => setEssai((n) => n + 1);
    window.addEventListener('online', relire);
    return () => window.removeEventListener('online', relire);
  }, [sansReseau]);

  const moi = 'moi' in session ? session.moi : undefined;
  const langue = moi?.langue ?? langueDuNavigateur();
  useEffect(() => {
    document.documentElement.lang = langue;
  }, [langue]);

  const ecran = route(chemin);
  // En session expirée, l'écran de connexion reste ouvert : c'est là que mène le bandeau.
  const cible =
    session.etat === 'expiree' && ecran.ecran === 'connexion'
      ? undefined
      : redirection(ecran, visiteurDe(session));
  useEffect(() => {
    if (cible !== undefined) {
      naviguer(cible, { remplacer: true });
    }
  }, [cible]);

  const contexte = useMemo(
    () => ({ langue, t: textes[langue], moi, actualiserMoi, definirMoi, fermerSession }),
    [langue, moi, actualiserMoi, definirMoi, fermerSession],
  );
  const { t } = contexte;

  let contenu: ComponentChildren;
  if (ecran.ecran === 'confidentialite') {
    // La notice s'ouvre à tous : elle n'attend pas la session, et reste lisible sans réseau ni
    // personne connue, sur la copie de l'appareil (1e-D15, S1-D8).
    contenu = <Ecran ecran={ecran} />;
  } else if (session.etat === 'injoignable') {
    contenu = (
      <>
        <p class="erreur" role="alert">
          {t.sans_connexion}
        </p>
        <button type="button" class="secondaire" onClick={() => setEssai((n) => n + 1)}>
          {t.reessayer}
        </button>
      </>
    );
  } else if (session.etat === 'chargement' || cible !== undefined) {
    contenu = <p>{t.chargement}</p>;
  } else {
    contenu = <Ecran ecran={ecran} />;
  }

  let bandeau: ComponentChildren;
  if (session.etat === 'connecte' && session.stockageEnEchec) {
    bandeau = (
      <p class="erreur" role="alert" data-testid="alerte-stockage">
        {t.stockage_en_echec}
      </p>
    );
  } else if (session.etat === 'hors_ligne') {
    bandeau = (
      <p class="bandeau" role="status" data-testid="bandeau-session">
        {t.session_hors_ligne}
      </p>
    );
  } else if (session.etat === 'expiree' && ecran.ecran !== 'connexion') {
    bandeau = (
      <p class="bandeau" role="status" data-testid="bandeau-session">
        <LienInterne vers="/connexion">{t.session_expiree}</LienInterne>
      </p>
    );
  }

  return (
    <ContexteApp.Provider value={contexte}>
      <MiseEnPage
        serveurInjoignable={t.serveur_injoignable}
        versionAppareil={t.version_appareil}
        lienCompte={moi === undefined ? undefined : t.compte_lien}
        lienNotice={t.notice_lien}
        bandeau={bandeau}
        cleEcran={cleDuFiletDEcran(ecran)}
        ecranEnErreur={t.ecran_en_erreur}
        recharger={t.recharger}
        lienAccueil={ecran.ecran === 'accueil' ? undefined : t.retour_accueil}
      >
        {contenu}
      </MiseEnPage>
    </ContexteApp.Provider>
  );
}
