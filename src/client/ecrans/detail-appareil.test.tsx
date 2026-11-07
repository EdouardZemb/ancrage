// @vitest-environment happy-dom
/*
 * Ce que « Mes appareils » et l'administration affichent d'un appareil, d'une seule source (1f-D4,
 * tâche 7) : le nom, et la ligne « depuis … · dernière activité … ».
 */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { formaterDate } from '../composants.js';
import { textes } from '../textes.js';
import { DetailAppareil, nomAppareil } from './detail-appareil.js';

const CREE_LE = '2026-10-05T08:30:00.000Z';
const UTILISE_LE = '2026-10-18T17:45:00.000Z';

afterEach(cleanup);

describe('DetailAppareil', () => {
  it('detail_d_une_passkey_jamais_utilisee', () => {
    const { container } = render(
      <DetailAppareil creeLe={CREE_LE} utiliseLe={null} langue="fr" textes={textes.fr} />,
    );

    expect(container.textContent).toBe(
      `${textes.fr.depuis} ${formaterDate(CREE_LE, 'fr')} · ${textes.fr.derniere_activite} ${textes.fr.jamais_utilisee}`,
    );
  });

  it('detail_d_une_session_avec_ses_deux_dates', () => {
    const { container } = render(
      <DetailAppareil creeLe={CREE_LE} utiliseLe={UTILISE_LE} langue="de" textes={textes.de} />,
    );

    // Les deux dates sont dans la langue demandée, et la mention « jamais utilisée » n'y est pas.
    expect(container.textContent).toBe(
      `${textes.de.depuis} ${formaterDate(CREE_LE, 'de')} · ${textes.de.derniere_activite} ${formaterDate(UTILISE_LE, 'de')}`,
    );
    expect(container.textContent).not.toContain(textes.de.jamais_utilisee);
    expect(formaterDate(CREE_LE, 'de')).not.toBe(formaterDate(CREE_LE, 'fr'));
  });
});

describe('nomAppareil', () => {
  it('nom_de_l_appareil_autre_traduit', () => {
    // Seul « autre » est un mot à traduire ; tout autre type d'appareil passe tel quel.
    expect(nomAppareil('autre', textes.fr.appareil_autre)).toBe('Autre appareil');
    expect(nomAppareil('autre', textes.de.appareil_autre)).toBe('Anderes Gerät');
    expect(nomAppareil('Pixel 7', textes.fr.appareil_autre)).toBe('Pixel 7');
    expect(nomAppareil('', textes.fr.appareil_autre)).toBe('');
  });
});
