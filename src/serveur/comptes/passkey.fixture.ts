/*
 * Une passkey factice pour les tests des routes : un identifiant au choix, une clé publique
 * quelconque (aucune signature n'est vérifiée par ces tests). Exclu de la construction, comme tout
 * `*.fixture.ts`.
 */
import type { TypeAppareil } from './appareil.js';
import type { Depot, PasskeyEnregistree } from './depot.js';

export function ajouterPasskeyDeTest(
  depot: Depot,
  personne: { id: string },
  id: string,
  appareil: TypeAppareil = 'Android',
): PasskeyEnregistree {
  return depot.ajouterPasskey({
    id,
    personne: personne.id,
    clePublique: new Uint8Array([1, 2, 3]),
    compteur: 0,
    transports: ['internal'],
    appareil,
  });
}
