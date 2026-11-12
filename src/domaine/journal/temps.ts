/*
 * Le temps du journal (ADR-0004, décision 9 du lot 1d). Un événement date sa réponse à l'heure
 * locale de l'appareil, avec son décalage : `AAAA-MM-JJTHH:MM:SS.mmm±HH:MM`. Le **jour** d'un
 * événement est ses dix premiers caractères, c'est-à-dire le jour local de l'appareil quand la
 * réponse a été donnée : c'est ce jour que comptent les échéances et les séries.
 *
 * Aucune fonction ne lit l'horloge ni le fuseau du poste : le résultat ne dépend que des
 * arguments.
 */

const MINUTES_PAR_HEURE = 60;
const MS_PAR_MINUTE = 60_000;

const sur2 = (n: number): string => String(n).padStart(2, '0');

/**
 * L'horodatage local d'un instant. `decalageMinutes` est le décalage de l'appareil à l'est de
 * UTC, c'est-à-dire `-new Date().getTimezoneOffset()` : +120 pour +02:00, -240 pour -04:00.
 * Un décalage nul s'écrit `+00:00`, jamais `Z`.
 */
export function horodatage(instantMs: number, decalageMinutes: number): string {
  const local = new Date(instantMs + decalageMinutes * MS_PAR_MINUTE).toISOString().slice(0, 23);
  const signe = decalageMinutes < 0 ? '-' : '+';
  const absolu = Math.abs(decalageMinutes);
  const heures = Math.floor(absolu / MINUTES_PAR_HEURE);
  return `${local}${signe}${sur2(heures)}:${sur2(absolu % MINUTES_PAR_HEURE)}`;
}

/** Le jour local, `AAAA-MM-JJ`, d'un horodatage de réponse. */
export function jourDe(reponduA: string): string {
  return reponduA.slice(0, 10);
}

/**
 * Le jour qui suit (ou précède, si `n` est négatif) `jour` de `n` jours. Le calcul se fait en
 * UTC : un jour est un jour, que la nuit ait 23, 24 ou 25 heures.
 */
export function ajouterJours(jour: string, n: number): string {
  const annee = Number(jour.slice(0, 4));
  const mois = Number(jour.slice(5, 7));
  const quantieme = Number(jour.slice(8, 10));
  return new Date(Date.UTC(annee, mois - 1, quantieme + n)).toISOString().slice(0, 10);
}

const MS_PAR_JOUR = 86_400_000;

/** Le jour `AAAA-MM-JJ` en millisecondes UTC : un jour est un jour, quelle que soit la nuit. */
function jourEnMs(jour: string): number {
  return Date.UTC(
    Number(jour.slice(0, 4)),
    Number(jour.slice(5, 7)) - 1,
    Number(jour.slice(8, 10)),
  );
}

/**
 * Le nombre de jours de `debut` à `fin`, deux jours `AAAA-MM-JJ` : négatif si `fin` précède
 * `debut`. Le calcul se fait en UTC, comme `ajouterJours`, sans dépendre du fuseau du poste.
 */
export function joursEntre(debut: string, fin: string): number {
  return (jourEnMs(fin) - jourEnMs(debut)) / MS_PAR_JOUR;
}
