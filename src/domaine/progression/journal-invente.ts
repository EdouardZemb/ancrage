import { hasardDeterministe } from '../hasard.js';
import { creerIdEvenement, type Evenement } from '../journal/evenement.js';
import { horodatage } from '../journal/temps.js';

/*
 * Un journal inventé, pour mesurer le rejeu (M3-P7) : des réponses réparties sur 60 jours, sur des
 * unités aux identifiants inventés, d'un hasard à graine. Ce fichier part dans le client construit :
 * il ne porte aucun texte de cours, aucun nom, et la fonction est pure (pas d'horloge).
 */

/** Le cours inventé de ces réponses. */
export const COURS_INVENTE = 'm0000000';
/** Le chapitre inventé que la moitié des unités porte. */
export const CHAPITRE_INVENTE = 'chapitre-invente';
/** Le dernier jour du journal inventé : une date fixe, jamais « aujourd'hui ». */
export const DERNIER_JOUR_INVENTE = '2026-11-01';

const APPAREIL_INVENTE = '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17';
const JOURS = 60;
const MS_PAR_JOUR = 86_400_000;
const PART_DE_JUSTES = 0.7;
const OCTETS_ALEATOIRES = 10;
/** Les octets de l'identifiant que le rang de l'événement occupe : de quoi les rendre tous différents. */
const DEBUT_DU_RANG = 5;
const FIN_DU_RANG = 9;

/** L'identifiant inventé de l'unité de rang `rang` : `m` et sept chiffres. */
function uniteInventee(rang: number): string {
  return `m${String(rang).padStart(7, '0')}`;
}

/** Le chapitre d'une unité inventée : les unités de rang pair portent le chapitre, les autres non. */
export function chapitreInvente(unite: string): string | undefined {
  return Number(unite.slice(1)) % 2 === 0 ? CHAPITRE_INVENTE : undefined;
}

/**
 * `taille` réponses sur `unites` unités, des 60 jours qui finissent à `DERNIER_JOUR_INVENTE`, dans
 * l'ordre du temps ; environ sept sur dix sont justes. La même graine rend le même journal.
 */
export function journalInvente(taille: number, unites: number, graine: number): Evenement[] {
  const hasard = hasardDeterministe(graine);
  const fin = Date.parse(`${DERNIER_JOUR_INVENTE}T23:59:59.999Z`);
  const debut = fin - JOURS * MS_PAR_JOUR + 1;
  const instants = Array.from(
    { length: taille },
    () => debut + Math.floor(hasard() * (fin - debut)),
  );
  instants.sort((a, b) => a - b);
  return instants.map((instant, rang) => {
    const aleatoire = new Uint8Array(OCTETS_ALEATOIRES);
    for (let i = 0; i < OCTETS_ALEATOIRES; i++) {
      aleatoire[i] = Math.floor(hasard() * 256);
    }
    for (let i = DEBUT_DU_RANG; i < FIN_DU_RANG; i++) {
      aleatoire[i] = Math.floor(rang / 256 ** (FIN_DU_RANG - 1 - i)) % 256;
    }
    return {
      id: creerIdEvenement(instant, aleatoire),
      cours: COURS_INVENTE,
      unite: uniteInventee(Math.floor(hasard() * unites)),
      type: 'reponse',
      resultat: { juste: hasard() < PART_DE_JUSTES },
      repondu_a: horodatage(instant, 0),
      appareil: APPAREIL_INVENTE,
      v: 1,
    };
  });
}
