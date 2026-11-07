/*
 * Le journal de progression sur l'appareil (ADR-0004, invariant 5) : la copie locale des
 * événements, rangés par personne, et la file de ceux qui n'ont pas encore été confirmés par le
 * serveur. On n'y fait qu'ajouter : aucune fonction ne modifie un événement, et un événement ne
 * quitte la file qu'une fois envoyé, ou si la personne abandonne sa file pour se déconnecter
 * (`abandonnerLaFile`, R31b).
 *
 * Un même `id` n'est jamais rangé deux fois pour une personne, ni dans le journal ni dans la file :
 * le premier fait foi, comme chez le serveur (`fusionnerEvenements`). Les lectures rendent donc des
 * événements sans doublon, dans l'ordre du journal ; les fonctions d'état dérivé n'ont pas à
 * dédoublonner.
 *
 * **La note des envois** (2b-D4) : un événement que le serveur a accepté quitte la file pour la note
 * de son cours (`confirmerLEnvoi`), et y reste jusqu'à ce qu'une lecture menée jusqu'au bout le
 * rende (`solderLaNote`). Elle permet de voir une restauration du serveur que le curseur ne montre
 * pas (`synchro.ts`). Ce n'est qu'une liste d'`id`, rangée dans l'enregistrement du curseur
 * (`envoyes`) : elle s'efface avec lui.
 */
import {
  type Evenement,
  schemaEvenement,
  trierEvenements,
} from '../../domaine/journal/evenement.js';
import {
  type BaseLocale,
  clesDe,
  type EvenementRange,
  type SchemaBaseLocale,
} from './base-locale.js';

type Curseur = SchemaBaseLocale['curseurs']['value'];

function ranger(personne: string, evenement: Evenement): EvenementRange {
  return { personne, id: evenement.id, cours: evenement.cours, evenement };
}

/**
 * La note des envois d'un enregistrement du curseur. Vide sans enregistrement, sans le champ (celui
 * qu'écrit le client de la version précédente), ou si le champ n'a pas la forme attendue.
 */
function noteDe(curseur: Curseur | undefined): string[] {
  const envoyes: unknown = curseur?.envoyes;
  if (!Array.isArray(envoyes)) return [];
  return envoyes.filter((id): id is string => typeof id === 'string');
}

/** L'enregistrement du curseur, avec `note` pour note des envois ; sans le champ si elle est vide. */
function avecLaNote(curseur: Curseur, note: readonly string[]): Curseur {
  const { envoyes: _remplacee, ...sansNote } = curseur;
  return note.length === 0 ? sansNote : { ...sansNote, envoyes: [...note] };
}

/**
 * Ajoute des événements donnés sur cet appareil, dans l'ordre, d'un seul tenant : tous, ou aucun.
 * C'est ainsi qu'un examen remis range ses réponses puis l'examen. Chacun entre au journal local,
 * pour que l'état en tienne compte aussitôt, et à la file d'envoi. Un `id` déjà connu de cette
 * personne (ou déjà vu plus tôt dans la liste) est ignoré : le premier fait foi.
 *
 * Chaque événement est validé par `schemaEvenement` avant toute écriture, et une erreur est levée
 * si l'un est invalide : rien n'est alors rangé. Le serveur refuse tout un lot dont un seul
 * événement est invalide, si bien qu'un événement invalide dans la file bloquerait l'envoi de tout
 * son cours. Le message de l'erreur ne cite rien des événements. Une écriture qui échoue annule la
 * transaction : rien n'est rangé non plus.
 */
export async function ajouterEvenements(
  base: BaseLocale,
  personne: string,
  evenements: readonly Evenement[],
): Promise<void> {
  if (!evenements.every((evenement) => schemaEvenement.safeParse(evenement).success)) {
    throw new Error("Événement invalide : rien n'a été rangé.");
  }
  const tx = base.transaction(['evenements', 'file'], 'readwrite');
  const journal = tx.objectStore('evenements');
  const file = tx.objectStore('file');
  // Un à un, dans la même transaction : chacun voit ce que les précédents ont rangé.
  const ecrire = async () => {
    for (const evenement of evenements) {
      const cle: [string, string] = [personne, evenement.id];
      if ((await journal.get(cle)) !== undefined) continue;
      const rangee = ranger(personne, evenement);
      const dansLaFile = (await file.get(cle)) !== undefined;
      await Promise.all([journal.put(rangee), dansLaFile ? undefined : file.put(rangee)]);
    }
  };
  await Promise.all([ecrire(), tx.done]);
}

/** Ajoute une réponse donnée sur cet appareil (`ajouterEvenements`, pour un seul événement). */
export async function ajouterEvenement(
  base: BaseLocale,
  personne: string,
  evenement: Evenement,
): Promise<void> {
  await ajouterEvenements(base, personne, [evenement]);
}

/** Les événements de la personne dans ce cours, sans doublon, dans l'ordre du journal. */
export async function evenementsDuCours(
  base: BaseLocale,
  personne: string,
  cours: string,
): Promise<Evenement[]> {
  const rangees = await base.getAllFromIndex('evenements', 'par_cours', [personne, cours]);
  return trierEvenements(rangees.map(({ evenement }) => evenement));
}

/** Les événements de ce cours qui n'ont pas encore été confirmés par le serveur, dans l'ordre. */
export async function fileDuCours(
  base: BaseLocale,
  personne: string,
  cours: string,
): Promise<Evenement[]> {
  const rangees = await base.getAllFromIndex('file', 'par_cours', [personne, cours]);
  return trierEvenements(rangees.map(({ evenement }) => evenement));
}

/** Les cours de la personne dont la file n'est pas vide, par identifiant. */
export async function coursEnAttente(base: BaseLocale, personne: string): Promise<string[]> {
  const rangees = await base.getAllFromIndex('file', 'par_cours', clesDe(personne));
  return [...new Set(rangees.map(({ cours }) => cours))].sort();
}

/** Le nombre de réponses de la personne qui attendent leur envoi, tous cours confondus. */
export async function nombreEnAttente(base: BaseLocale, personne: string): Promise<number> {
  return base.count('file', clesDe(personne));
}

/**
 * Supprime toute la file de la personne, sans toucher au journal local ; rend le nombre de
 * réponses abandonnées. C'est la seule façon pour des réponses de quitter la file sans être
 * parties : la personne l'a demandé, en connaissance de cause, pour se déconnecter (R31b, 1e-D11).
 * Comptées et supprimées dans la même transaction, pour que le nombre rendu soit celui qui a
 * disparu.
 */
export async function abandonnerLaFile(base: BaseLocale, personne: string): Promise<number> {
  const tx = base.transaction('file', 'readwrite');
  const [abandonnees] = await Promise.all([
    tx.store.count(clesDe(personne)),
    tx.store.delete(clesDe(personne)),
    tx.done,
  ]);
  return abandonnees;
}

/**
 * Le serveur a accepté ces `id` : ils quittent la file et entrent dans la note des envois de leur
 * cours (2b-D4), d'un seul tenant. Le journal local ne bouge pas.
 *
 * Seuls les `id` encore dans la file sont notés. La page et le service worker peuvent confirmer le
 * même envoi : c'est celui qui le retire de la file qui le note, une seule fois. Une confirmation
 * en double ne note donc rien. Une confirmation peut en revanche noter un `id` qu'une lecture a
 * déjà rendu, si elle arrive après le solde de cette lecture (`solderLaNote`) : l'entrée périmée
 * coûte au plus une relecture complète (2b-D4), jamais une perte ni un doublon. La note est lue et
 * réécrite dans la même transaction `readwrite` : aucun écrivain n'écrase ce que l'autre y a mis.
 */
export async function confirmerLEnvoi(
  base: BaseLocale,
  personne: string,
  ids: readonly string[],
): Promise<void> {
  const tx = base.transaction(['file', 'curseurs'], 'readwrite');
  const file = tx.objectStore('file');
  const curseurs = tx.objectStore('curseurs');
  const deplacer = async () => {
    const retirees = await Promise.all(
      ids.map(async (id) => {
        const rangee = await file.get([personne, id]);
        if (rangee !== undefined) await file.delete([personne, id]);
        return rangee;
      }),
    );
    const parCours = new Map<string, Set<string>>();
    for (const rangee of retirees) {
      if (rangee === undefined) continue;
      parCours.set(rangee.cours, (parCours.get(rangee.cours) ?? new Set()).add(rangee.id));
    }
    for (const [cours, envoyes] of parCours) {
      const lue = await curseurs.get([personne, cours]);
      const note = new Set([...noteDe(lue), ...envoyes]);
      await curseurs.put(avecLaNote(lue ?? { personne, cours, curseur: 0 }, [...note]));
    }
  };
  await Promise.all([deplacer(), tx.done]);
}

/**
 * Les `id` du cours que le serveur a acceptés et qu'aucune lecture menée jusqu'au bout n'a encore
 * rendus (2b-D4), dans l'ordre de leur confirmation.
 */
export async function noteDesEnvois(
  base: BaseLocale,
  personne: string,
  cours: string,
): Promise<string[]> {
  return noteDe(await base.get('curseurs', [personne, cours]));
}

/**
 * Solde la note des envois du cours au bout d'une lecture menée jusqu'à la fin (2b-D4), d'un seul
 * tenant : les `id` de `retirer` sortent de la note, et les événements de `remettre`, que le serveur
 * a perdus (restauration d'une sauvegarde plus ancienne, R13), reviennent dans la file pour
 * repartir. Le journal local ne bouge pas, et un `id` déjà dans la file y reste tel quel.
 *
 * Tout se fait dans une transaction `readwrite` sur la file et les curseurs : un envoi que l'autre
 * écrivain confirme entre-temps reste dans la note, et un événement remis en file ne peut être
 * confirmé, donc noté, qu'après qu'il est sorti de la note.
 */
export async function solderLaNote(
  base: BaseLocale,
  personne: string,
  cours: string,
  retirer: ReadonlySet<string>,
  remettre: readonly Evenement[] = [],
): Promise<void> {
  const tx = base.transaction(['file', 'curseurs'], 'readwrite');
  const file = tx.objectStore('file');
  const curseurs = tx.objectStore('curseurs');
  const remises = remettre.map(async (evenement) => {
    if ((await file.get([personne, evenement.id])) === undefined) {
      await file.put(ranger(personne, evenement));
    }
  });
  const solder = async () => {
    const lue = await curseurs.get([personne, cours]);
    if (lue === undefined) return;
    const note = noteDe(lue);
    const reste = note.filter((id) => !retirer.has(id));
    if (reste.length < note.length) await curseurs.put(avecLaNote(lue, reste));
  };
  await Promise.all([...remises, solder(), tx.done]);
}

/**
 * Où en est la lecture du journal d'un cours : le dernier numéro que le serveur a rendu (0 si l'on
 * n'a rien lu), et l'`id` de l'événement de ce numéro. C'est cet `id` qui permet de voir qu'un
 * serveur restauré n'a plus le même journal : un numéro ne le dirait pas (voir `synchro.ts`).
 */
export interface PositionDeLecture {
  curseur: number;
  /** L'`id` de l'événement du curseur, `undefined` si le curseur est 0 ou si on ne le connaît plus. */
  dernier: string | undefined;
}

export async function positionDuCours(
  base: BaseLocale,
  personne: string,
  cours: string,
): Promise<PositionDeLecture> {
  const lue = await base.get('curseurs', [personne, cours]);
  return { curseur: lue?.curseur ?? 0, dernier: lue?.dernier };
}

/** Le dernier numéro du journal d'un cours que le serveur a rendu ; 0 si l'on n'a rien lu. */
export async function curseurDuCours(
  base: BaseLocale,
  personne: string,
  cours: string,
): Promise<number> {
  return (await positionDuCours(base, personne, cours)).curseur;
}

/**
 * Range une page du journal rendue par le serveur : les événements nouveaux entrent au journal
 * local (pas dans la file, ils sont déjà chez le serveur). Un `id` déjà connu est ignoré, le
 * premier fait foi : l'union ne perd jamais un événement local. Un événement d'un autre cours que
 * `cours` n'est pas rangé.
 *
 * Si `curseur` est donné, il est rangé dans la même transaction, avec l'`id` du dernier événement
 * de la page (celui de ce numéro). Une page vide au même curseur garde l'`id` déjà connu ; à un
 * autre curseur, on ne sait plus quel événement le désigne. Sans `curseur`, la position ne bouge
 * pas : les événements sont rangés, rien d'autre.
 *
 * La note des envois, rangée dans le même enregistrement, reste telle quelle : seule une lecture
 * menée jusqu'au bout la solde (`solderLaNote`), pas une page.
 */
export async function recevoirEvenements(
  base: BaseLocale,
  personne: string,
  cours: string,
  evenements: readonly Evenement[],
  curseur?: number,
): Promise<void> {
  const tx = base.transaction(['evenements', 'curseurs'], 'readwrite');
  const journal = tx.objectStore('evenements');
  const duCours = evenements.filter((evenement) => evenement.cours === cours);
  const ecritures: Promise<unknown>[] = [tx.done];

  if (curseur !== undefined) {
    const curseurs = tx.objectStore('curseurs');
    ecritures.push(
      curseurs.get([personne, cours]).then((lue) => {
        const dernier = duCours.at(-1)?.id ?? (lue?.curseur === curseur ? lue.dernier : undefined);
        const envoyes = lue?.envoyes;
        return curseurs.put({
          personne,
          cours,
          curseur,
          ...(dernier === undefined ? {} : { dernier }),
          ...(envoyes === undefined ? {} : { envoyes }),
        });
      }),
    );
  }
  for (const evenement of duCours) {
    ecritures.push(
      journal.get([personne, evenement.id]).then((connu) => {
        if (connu === undefined) return journal.put(ranger(personne, evenement));
      }),
    );
  }
  await Promise.all(ecritures);
}
