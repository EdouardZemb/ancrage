/*
 * L'identifiant de l'appareil (ADR-0004, ADR-0007) : un UUID tiré au hasard, une fois, et gardé
 * dans le `localStorage` sous `ancrage.appareil`. Il marque chaque événement (`appareil`) pour que
 * l'on sache sur quel appareil une réponse a été donnée. Il ne désigne personne : c'est un hasard,
 * et non une empreinte de l'appareil.
 *
 * Le stockage peut manquer (fenêtre privée, données bloquées) ou refuser l'écriture : l'identifiant
 * reste alors le même pendant le chargement de la page, et un autre au chargement suivant.
 */
const CLE = 'ancrage.appareil';

// Le format que le serveur exige de `appareil` : il refuse tout un lot si un seul ne l'a pas.
const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// L'identifiant de cette page, quand le stockage ne le garde pas.
let dePage: string | undefined;

function lireGarde(): string | undefined {
  try {
    const garde = localStorage.getItem(CLE);
    return garde !== null && FORMAT_UUID.test(garde) ? garde : undefined;
  } catch {
    return undefined;
  }
}

export function identifiantAppareil(): string {
  const garde = lireGarde();
  if (garde !== undefined) return garde;

  dePage ??= crypto.randomUUID();
  try {
    localStorage.setItem(CLE, dePage);
  } catch {
    // Pas de stockage : l'identifiant de la page fait l'affaire jusqu'au prochain chargement.
  }
  return dePage;
}
