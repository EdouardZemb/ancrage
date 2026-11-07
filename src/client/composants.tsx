/*
 * Les petits composants que plusieurs écrans partagent : un lien interne, le message d'un échec,
 * un bouton d'action à confirmer, l'affichage d'un lien à usage unique avec son bouton de
 * partage, et le filet qui retient une erreur d'affichage.
 */
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { naviguer } from './routeur.js';
import type { CleTexte, Langue } from './textes.js';

/** Un lien vers un écran du client : la page ne se recharge pas, le clic « ouvrir dans… » marche. */
export function LienInterne(props: { vers: string; class?: string; children: ComponentChildren }) {
  const suivre = (evenement: MouseEvent) => {
    const modifie =
      evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey;
    if (evenement.defaultPrevented || evenement.button !== 0 || modifie) {
      return;
    }
    evenement.preventDefault();
    naviguer(props.vers);
  };
  return (
    <a href={props.vers} class={props.class} onClick={suivre}>
      {props.children}
    </a>
  );
}

/** Le texte d'un échec, annoncé par les lecteurs d'écran ; rien s'il n'y en a pas. */
export function MessageErreur(props: { message: string | undefined }) {
  if (props.message === undefined) {
    return null;
  }
  return (
    <p class="erreur" role="alert">
      {props.message}
    </p>
  );
}

/** Le temps laissé pour le second toucher d'un `BoutonConfirme`. */
const DELAI_CONFIRMATION_MS = 5000;

/**
 * Le bouton d'une action qui ne se défait pas, en deux temps : le premier toucher le change en
 * « Confirmer ? », le second, dans les 5 secondes, lance l'action. Passé ce délai, le bouton
 * revient à son état de départ. Pas de `window.confirm` : sa boîte bloque la page (et les tests
 * de bout en bout).
 */
export function BoutonConfirme(props: {
  libelle: string;
  /** Le libellé du second temps (« Confirmer ? »). */
  confirmer: string;
  /** Le nom du bouton pour les lecteurs d'écran : l'action et ce qu'elle touche. */
  description: string;
  disabled?: boolean;
  onConfirme: () => void;
}) {
  const [aConfirmer, setAConfirmer] = useState(false);

  useEffect(() => {
    if (!aConfirmer) {
      return;
    }
    const minuterie = setTimeout(() => setAConfirmer(false), DELAI_CONFIRMATION_MS);
    return () => clearTimeout(minuterie);
  }, [aConfirmer]);

  const toucher = () => {
    if (!aConfirmer) {
      setAConfirmer(true);
      return;
    }
    setAConfirmer(false);
    props.onConfirme();
  };

  return (
    <button
      type="button"
      class={aConfirmer ? 'secondaire a-confirmer' : 'secondaire'}
      disabled={props.disabled}
      aria-label={aConfirmer ? `${props.confirmer} ${props.description}` : props.description}
      onClick={toucher}
    >
      {aConfirmer ? props.confirmer : props.libelle}
    </button>
  );
}

/**
 * Le filet d'une erreur d'affichage (1e-D13) : si le rendu de ses enfants échoue, il les remplace
 * par `message` et un bouton « Recharger », et le reste de l'application garde la main (l'en-tête,
 * la barre des onglets). L'erreur est consignée dans la console.
 *
 * Avec `lienAccueil`, il offre aussi ce lien vers l'accueil, après « Recharger » (1f-D11). Il reste
 * facultatif : le filet de l'onglet du cours n'en a pas, et celui de l'accueil non plus, car le lien
 * ne mènerait nulle part.
 *
 * Il ne se réarme pas de lui-même : l'appelant lui donne une `key` qui change avec ce qu'il
 * entoure (l'onglet, l'écran), et un filet neuf montre de nouveau ses enfants. Il ne retient que
 * le rendu (et les effets) : l'échec d'une promesse ou d'un gestionnaire d'événement lui échappe.
 */
export class Rattrapage extends Component<
  { message: string; libelleRecharger: string; lienAccueil?: string; children: ComponentChildren },
  { erreur: boolean }
> {
  state = { erreur: false };

  static getDerivedStateFromError(): { erreur: boolean } {
    return { erreur: true };
  }

  componentDidCatch(erreur: unknown): void {
    console.error('ancrage : l’affichage a échoué', erreur);
  }

  render() {
    if (!this.state.erreur) {
      return this.props.children;
    }
    return (
      <div role="alert">
        <p class="erreur">{this.props.message}</p>
        <button type="button" class="secondaire" onClick={() => location.reload()}>
          {this.props.libelleRecharger}
        </button>
        {this.props.lienAccueil !== undefined && (
          <p>
            <LienInterne vers="/">{this.props.lienAccueil}</LienInterne>
          </p>
        )}
      </div>
    );
  }
}

type LibellesPartage = Pick<
  Record<CleTexte, string>,
  'partager' | 'copier' | 'lien_copie' | 'copie_impossible' | 'lien_secret'
>;

/**
 * Un lien à usage unique, montré tel qu'il vient d'être créé, avec « Partager ». Le téléphone
 * ouvre son menu de partage (`navigator.share`) ; sans lui, le lien est copié. Le lien n'est
 * gardé nulle part : ni `localStorage`, ni l'adresse de la page.
 */
export function LienAPartager(props: {
  lien: string;
  t: LibellesPartage;
  /** Une phrase au-dessus du lien : à qui il sert, combien de temps. */
  consigne?: string;
}) {
  const [message, setMessage] = useState<string | undefined>();
  const peutPartager = typeof navigator.share === 'function';

  const partager = async () => {
    setMessage(undefined);
    if (peutPartager) {
      try {
        await navigator.share({ title: 'ancrage', url: props.lien });
        return;
      } catch (echec) {
        // La personne a refermé le menu : ce n'est pas un échec.
        if (echec instanceof Error && echec.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(props.lien);
      setMessage(props.t.lien_copie);
    } catch {
      setMessage(props.t.copie_impossible);
    }
  };

  return (
    <div class="partage">
      {props.consigne !== undefined && <p>{props.consigne}</p>}
      <code class="lien-genere" data-testid="lien-genere">
        {props.lien}
      </code>
      <p class="detail">{props.t.lien_secret}</p>
      <button type="button" class="principal" data-testid="partager" onClick={partager}>
        {peutPartager ? props.t.partager : props.t.copier}
      </button>
      {message !== undefined && (
        <p class="ok" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

/** Une date et une heure à la façon de la langue ; vide si `iso` n'est pas une date. */
export function formaterDate(iso: string, langue: Langue): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(langue, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
