/*
 * Une tâche à trous (`trous`) : des phrases où chaque trou est une case. Avec une `liste`, la liste
 * est une rangée de pastilles, et une case est visée à la fois (`aria-pressed`) : d'abord la première
 * case vide de la tâche. Toucher une case vide la vise ; toucher une case pleine la vide et la vise ;
 * toucher une pastille remplit la case visée, puis vise la case vide suivante de la même phrase, à
 * défaut la première case vide de la tâche. Une case pleine dit son mot dans son nom accessible
 * (« Lücke 1: … »). Sans liste, chaque trou est un champ où l'on tape.
 * `t.pruefen` juge toute la tâche d'un coup ; il reste inactif tant qu'une case est vide (ou faite
 * d'espaces) : une case vide n'est pas une réponse fausse, elle n'est jamais enregistrée (R16).
 *
 * Une phrase est un seul élément du journal, juste si tous ses trous le sont (F1-D5). Les saisies
 * d'une phrase, dans l'ordre de ses trous, vivent dans la mémoire de l'onglet, rangées par
 * identifiant de phrase ; « déjà jugée » vit sous une sous-clé de la tâche.
 */
import { Fragment } from 'preact';
import { morceauxDePhrase } from '../../../domaine/contenu/feuille.js';
import type { PhraseATrous } from '../../../domaine/contenu/modele.js';
import { phraseJuste } from '../../../domaine/feuilles/correction.js';
import { useCours } from '../contexte-cours.js';
import { formater } from '../textes-cours.js';
import { CLE_FEUILLES, type PropsDeTache, resultatsDeTache, useEtatDesElements } from './tache.js';

/** Une case : le rang du trou dans la phrase que `id` désigne. */
interface Case {
  id: string;
  rang: number;
}

export function TacheATrous(props: PropsDeTache<'trous'>) {
  const { tache, onRepondu } = props;
  const { t, useEtatDOnglet } = useCours();
  const { liste } = tache;
  const avecListe = liste !== undefined;
  const [saisies, changer] = useEtatDesElements<PhraseATrous, string[]>(
    tache,
    tache.phrases,
    (phrase) => phrase.reponses.map(() => ''),
  );
  const [jugee, juger] = useEtatDOnglet<boolean>(`${CLE_FEUILLES}/${tache.id}/jugee`, () => false);

  const [visee, viser] = useEtatDOnglet<Case | null>(
    `${CLE_FEUILLES}/${tache.id}/visee`,
    () => null,
  );

  const ecrire = (phrase: PhraseATrous, rang: number, valeur: string) =>
    changer(
      phrase.id,
      saisies[phrase.id].map((saisie, i) => (i === rang ? valeur : saisie)),
    );
  /** La case visée : celle que l'on a choisie si elle est encore vide, sinon la première vide. */
  const cible = (): Case | null => {
    if (visee !== null && saisies[visee.id]?.[visee.rang] === '') return visee;
    const phrase = tache.phrases.find(({ id }) => saisies[id].includes(''));
    return phrase === undefined ? null : { id: phrase.id, rang: saisies[phrase.id].indexOf('') };
  };
  const courante = avecListe ? cible() : null;
  /** Une pastille touchée : elle remplit la case visée, puis la visée passe à la suivante vide. */
  const remplir = (mot: string) => {
    const phrase = tache.phrases.find(({ id }) => id === courante?.id);
    if (courante === null || phrase === undefined) return;
    const apres = saisies[phrase.id].map((saisie, i) => (i === courante.rang ? mot : saisie));
    ecrire(phrase, courante.rang, mot);
    const suivante = apres.indexOf('');
    viser(suivante < 0 ? null : { id: phrase.id, rang: suivante });
  };
  /** Une case touchée : la pleine est vidée ; dans les deux cas, elle est la case visée. */
  const toucher = (phrase: PhraseATrous, rang: number) => {
    if (saisies[phrase.id][rang] !== '') ecrire(phrase, rang, '');
    viser({ id: phrase.id, rang });
  };
  /** Toutes les cases sont remplies : la tâche peut être jugée. */
  const remplie = tache.phrases.every(({ id }) =>
    saisies[id].every((saisie) => saisie.trim() !== ''),
  );
  const verifier = () => {
    if (!remplie) return;
    const resultats = resultatsDeTache(
      tache.phrases,
      saisies,
      (phrase, saisie) => phraseJuste(saisie, phrase, avecListe),
      // Une liste de mots à placer : des propositions ; sans liste, la personne tape.
      avecListe ? 'choix' : 'saisie',
    );
    juger(true);
    if (resultats !== undefined) onRepondu(resultats);
  };

  return (
    <>
      {avecListe && (
        <div class="pastilles">
          {liste.map((mot, i) => (
            <button
              key={`${i}|${mot}`}
              type="button"
              class="pastille"
              disabled={jugee}
              onClick={() => remplir(mot)}
            >
              {mot}
            </button>
          ))}
        </div>
      )}
      {tache.phrases.map((phrase) => (
        <PhraseAvecTrous
          key={phrase.id}
          phrase={phrase}
          saisie={saisies[phrase.id]}
          visee={courante?.id === phrase.id ? courante.rang : null}
          avecListe={avecListe}
          jugee={jugee}
          ecrire={(rang, valeur) => ecrire(phrase, rang, valeur)}
          toucher={(rang) => toucher(phrase, rang)}
        />
      ))}
      <button type="button" class="small-btn" disabled={jugee || !remplie} onClick={verifier}>
        {t.pruefen}
      </button>
    </>
  );
}

function PhraseAvecTrous(props: {
  phrase: PhraseATrous;
  saisie: readonly string[];
  /** Le rang du trou visé dans cette phrase, `null` s'il n'est pas dans cette phrase. */
  visee: number | null;
  avecListe: boolean;
  jugee: boolean;
  ecrire(rang: number, valeur: string): void;
  toucher(rang: number): void;
}) {
  const { phrase, saisie, visee, avecListe, jugee, ecrire, toucher } = props;
  const { t } = useCours();
  const juste = jugee && phraseJuste(saisie, phrase, avecListe);
  const etiquette = (rang: number) => formater(t.feuilles_luecke, { n: rang + 1 });
  /** Une case pleine dit aussi son mot : son nom accessible remplace le texte qu'elle montre. */
  const etiquetteDeCase = (rang: number) =>
    saisie[rang] === ''
      ? etiquette(rang)
      : formater(t.feuilles_luecke_mit, { n: rang + 1, mot: saisie[rang] });
  const trou = (rang: number) =>
    avecListe ? (
      <button
        type="button"
        class="trou"
        aria-label={etiquetteDeCase(rang)}
        aria-pressed={visee === rang}
        disabled={jugee}
        onClick={() => toucher(rang)}
      >
        {saisie[rang] || ' '}
      </button>
    ) : (
      <input
        class="trou"
        aria-label={etiquette(rang)}
        value={saisie[rang]}
        disabled={jugee}
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
        onInput={(e) => ecrire(rang, e.currentTarget.value)}
      />
    );

  return (
    <div class={jugee ? `element phrase ${juste ? 'right' : 'wrong'}` : 'element phrase'}>
      {morceauxDePhrase(phrase.texte).map((morceau, rang) => (
        <Fragment key={rang}>
          {morceau}
          {rang < phrase.reponses.length && trou(rang)}
        </Fragment>
      ))}
      {jugee && !juste && <p class="correction">{phrase.reponses.join(' · ')}</p>}
    </div>
  );
}
