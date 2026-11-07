/*
 * La nouvelle version de l'application, appliquée au bon moment (2a-D2). Une version installée
 * attend (2a-D1) ; ce module choisit quand lui demander de prendre la main, puis recharge la page
 * pour que le nouveau code serve. Les moments sont trois : le lancement, le retour sur la page et
 * une navigation. Une version trouvée entre deux moments attend le suivant : la page ne se recharge
 * jamais sous les yeux, ni en pleine séance (2a-D3), sauf après une absence longue, qui abandonne
 * une séance journalisée, jamais une séance retenue (2a-D4, `Seance`). La séance se relit à chaque
 * décision, celle de recharger comprise. Le rechargement laisse d'abord finir les synchronisations
 * en cours, envois et lectures, au plus deux secondes, puis relit la règle : une séance commencée
 * entre-temps le reporte au moment permis suivant (2b-D5).
 */
import { surNavigation } from './routeur.js';
import { type Seance, seanceEnCours } from './seance.js';
import { baseDeLaPage } from './stockage/base-de-la-page.js';
import { MESSAGE_PRENDRE_LA_MAIN } from './sw-protocole.js';
import { attendreLesSynchronisations } from './synchro.js';

/**
 * Hors de la page au-delà de cette durée, une séance journalisée est tenue pour abandonnée
 * (2a-D4).
 */
export const ABSENCE_LONGUE_MS = 30 * 60 * 1000;

/**
 * Au-delà de ce délai après la demande, la prise de main ne répond plus au moment qui l'a demandée
 * (2a-D2). Un service worker actif occupé, par exemple réveillé pour une requête de l'écran qui
 * s'ouvre, retarde l'activation de la nouvelle version jusqu'à 30 s : la page ne se recharge pas
 * alors sous les yeux, elle attend le moment suivant.
 */
export const DELAI_DE_PRISE_DE_MAIN_MS = 5000;

/**
 * L'attente la plus longue des synchronisations en cours, envois et lectures, avant un
 * rechargement (2b-D5). Au-delà, la page se recharge tout de même : un envoi coupé laisse ses
 * réponses dans la file, qui repart au prochain écran de cours, et une lecture coupée reprend sans
 * rien perdre.
 */
export const ATTENTE_DES_ENVOIS_MS = 2000;

/** Les seuls moments où une version s'applique (2a-D2). */
export type Moment = 'lancement' | 'retour' | 'navigation';

/**
 * Si la version qui attend peut s'appliquer à ce moment. Hors séance, toujours. En séance retenue
 * (une Prüfung, un Bericht), jamais : ses réponses ne sont pas encore au journal, on les perdrait
 * toutes. En séance journalisée, seulement au retour après une absence longue (2a-D4) : la séance
 * est tenue pour abandonnée, et l'on perd au plus la question affichée, car les réponses données
 * sont dans le journal.
 */
export function peutAppliquer(
  moment: Moment,
  etat: { seance: Seance | null; absenceMs: number },
): boolean {
  if (etat.seance === null) return true;
  if (etat.seance === 'retenue') return false;
  return moment === 'retour' && etat.absenceMs >= ABSENCE_LONGUE_MS;
}

/** Ce dont la mise à jour dépend, que les tests remplacent. */
export interface EnvironnementMiseAJour {
  /** `navigator.serviceWorker`, absent d'un navigateur ou d'un contexte qui n'en a pas. */
  conteneur: ServiceWorkerContainer | undefined;
  document: Document;
  maintenant(): number;
  recharger(): void;
  seanceEnCours(): Seance | null;
  /**
   * Se règle quand aucune synchronisation n'est plus en cours, envoi ou lecture (2b-D5). Le
   * rechargement l'attend, au plus `ATTENTE_DES_ENVOIS_MS`.
   */
  attendreLesEnvois(): Promise<void>;
  /** Le moment « navigation » : après `naviguer`, et au bouton « retour » (`routeur.ts`). */
  surNavigation(abonne: () => void): () => void;
  /** Exécute `f` une fois rendue la nouvelle adresse. */
  differer(f: () => void): void;
}

/**
 * Le `differer` de la page : une tâche plus tard. Preact rend en microtâche, et l'écran du cours
 * retire sa séance au démontage même (`useLayoutEffect`) : l'écran quitté n'est plus là (2a-D2).
 */
export function differerApresLeRendu(f: () => void): void {
  setTimeout(f, 0);
}

/**
 * Les envois de la page : les synchronisations de sa base, envois compris
 * (`attendreLesSynchronisations`, qui ne rejette jamais). Une base qui ne s'ouvre pas n'a rien en
 * cours : il n'y a rien à attendre.
 */
export function attendreLesEnvoisDeLaPage(): Promise<void> {
  return baseDeLaPage().then(attendreLesSynchronisations, () => undefined);
}

function environnementDeLaPage(): EnvironnementMiseAJour {
  return {
    conteneur: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    document,
    maintenant: Date.now,
    recharger: () => location.reload(),
    seanceEnCours,
    attendreLesEnvois: attendreLesEnvoisDeLaPage,
    surNavigation,
    differer: differerApresLeRendu,
  };
}

/**
 * Attend la promesse que rend `attendre`, réussie ou non, mais pas au-delà de `ms`. Ne rejette
 * jamais, même si `attendre` lève.
 */
async function attendreAuPlus(attendre: () => Promise<unknown>, ms: number): Promise<void> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const echeance = new Promise<void>((resolve) => {
    minuteur = setTimeout(resolve, ms);
  });
  const ignorer = () => {};
  const reglee = Promise.resolve().then(attendre).then(ignorer, ignorer);
  await Promise.race([reglee, echeance]);
  clearTimeout(minuteur);
}

/**
 * Branche les trois moments, une fois le service worker enregistré (`main.tsx`). Sans service
 * worker, rien ne se passe (2a-D7).
 */
export async function installerMiseAJour(
  env: EnvironnementMiseAJour = environnementDeLaPage(),
): Promise<void> {
  const { conteneur } = env;
  if (conteneur === undefined) return;
  // Illisible, elle compte comme absente : rien ne se passe, et aucun rejet ne reste (2a-D7).
  const registration = await conteneur.getRegistration('/').catch(() => undefined);
  if (registration === undefined) return;

  // Le moment qui a envoyé le message à la version en attente, son absence et son instant : au
  // `controllerchange`, la règle se relit avec eux et la séance du moment.
  let demande: { moment: Moment; absenceMs: number; instant: number } | undefined;
  // Un changement que la règle n'a pas permis (un autre onglet, une séance commencée depuis la
  // demande, une prise de main tardive), ou un rechargement qu'elle ne permet plus après l'attente
  // des envois : la page se recharge à son prochain moment permis (2a-D7, 2b-D5).
  let rechargementDu = false;
  // Une fois par chargement, jamais plus : pas de boucle (2a-D7). Posé dès que le rechargement
  // commence, avant l'attente des envois : rien d'autre ne se passe pendant elle. Levé seulement si
  // la règle, relue après l'attente, ne permet plus (2b-D5).
  let recharge = false;
  // L'instant du dernier passage à `hidden`. Sans départ connu, l'absence est nulle.
  let parti: number | undefined;

  const permis = (moment: Moment, absenceMs: number) =>
    peutAppliquer(moment, { seance: env.seanceEnCours(), absenceMs });

  // Le rechargement permis à `moment`, après `absenceMs` : il attend les envois en cours, au plus
  // `ATTENTE_DES_ENVOIS_MS`, puis relit la règle avec ce même moment et cette même absence. Une
  // séance commencée pendant l'attente le reporte au moment permis suivant (2b-D5).
  const recharger = (moment: Moment, absenceMs: number) => {
    if (recharge) return;
    recharge = true;
    void attendreAuPlus(() => env.attendreLesEnvois(), ATTENTE_DES_ENVOIS_MS).then(() => {
      if (permis(moment, absenceMs)) {
        env.recharger();
        return;
      }
      recharge = false;
      rechargementDu = true;
    });
  };

  const evaluer = (moment: Moment, absenceMs: number) => {
    if (recharge || !permis(moment, absenceMs)) return;
    if (rechargementDu) {
      recharger(moment, absenceMs);
      return;
    }
    const enAttente = registration.waiting;
    if (enAttente === null) return;
    enAttente.postMessage(MESSAGE_PRENDRE_LA_MAIN);
    demande = { moment, absenceMs, instant: env.maintenant() };
  };

  // Le navigateur ne vérifie pas de lui-même à chaque retour : on le lui demande (2a-D2). Une
  // version trouvée s'installe d'abord, puis attend le moment suivant. Un échec, hors ligne par
  // exemple, est ignoré sans rien afficher (2a-D7).
  const verifier = async () => {
    try {
      await registration.update();
    } catch {
      // Rien : la vérification suivante, au prochain retour, recommencera.
    }
  };

  // Une prise de main qui arrive plus de `DELAI_DE_PRISE_DE_MAIN_MS` après la demande compte comme
  // non demandée : le moment est passé, la page ne se recharge pas sous les yeux.
  conteneur.addEventListener('controllerchange', () => {
    const aTemps =
      demande !== undefined && env.maintenant() - demande.instant <= DELAI_DE_PRISE_DE_MAIN_MS;
    if (demande !== undefined && aTemps && permis(demande.moment, demande.absenceMs)) {
      recharger(demande.moment, demande.absenceMs);
    } else {
      rechargementDu = true;
    }
  });
  env.document.addEventListener('visibilitychange', () => {
    if (env.document.visibilityState === 'hidden') {
      parti = env.maintenant();
      return;
    }
    const absenceMs = parti === undefined ? 0 : env.maintenant() - parti;
    parti = undefined;
    // Aussitôt, sur la version qui attend déjà : la vérification n'est pas attendue, car elle
    // ne rend pas une version prête, et un réseau lent rechargerait par-dessus une séance reprise.
    evaluer('retour', absenceMs);
    void verifier();
  });
  env.surNavigation(() => env.differer(() => evaluer('navigation', 0)));
  evaluer('lancement', 0);
}
