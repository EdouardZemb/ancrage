/*
 * La composition de la notice (S1-D7) : le gabarit et les valeurs d'une instance. Fichier muté
 * (S1-D15) : des tests à plat, sans `describe` (1f-R10).
 */
import { expect, it } from 'vitest';
import {
  CLES_DE_NOTICE,
  composerNotice,
  dateAffichee,
  estUneCibleAdmise,
  type Notice,
} from './notice.js';

/** Un petit gabarit, dont les trous couvrent chaque cas : titres, liste, paragraphes, fragments. */
const GABARIT: Notice = {
  titre: 'Notice de {tunnel}',
  introduction: 'Une application, chez {lieu_du_serveur}.',
  sections: [
    { titre: 'Qui ?', paragraphes: ['{responsable}'] },
    {
      titre: 'Où, avec {tunnel} ?',
      liste: ['{tiers_tunnel}', 'Fixe.', 'Par {tunnel}, puis {tunnel} encore.'],
      paragraphes: ['{transferts}', 'Sous {delai_reponse}.'],
    },
  ],
};

/** Une valeur factice par clé : la clé elle-même, en majuscules. */
function valeurs(remplacees: Record<string, string> = {}): Record<string, string> {
  return {
    ...Object.fromEntries(CLES_DE_NOTICE.map((cle) => [cle, cle.toUpperCase()])),
    ...remplacees,
  };
}

it('composer_remplit_chaque_trou', () => {
  const attendue: Notice = {
    titre: 'Notice de TUNNEL',
    introduction: 'Une application, chez LIEU_DU_SERVEUR.',
    sections: [
      { titre: 'Qui ?', paragraphes: ['RESPONSABLE'] },
      {
        titre: 'Où, avec TUNNEL ?',
        liste: ['TIERS_TUNNEL', 'Fixe.', 'Par TUNNEL, puis TUNNEL encore.'],
        paragraphes: ['TRANSFERTS', 'Sous DELAI_REPONSE.'],
      },
    ],
  };

  const composee = composerNotice(GABARIT, valeurs());

  // L'ordre des clés compte : l'instantané de la notice est un texte JSON (S1-D10).
  expect(JSON.stringify(composee)).toBe(JSON.stringify(attendue));
  // Le gabarit n'est pas touché.
  expect(GABARIT.sections[0]?.paragraphes).toEqual(['{responsable}']);
});

it('composer_ne_remplace_qu_une_fois', () => {
  // Une valeur qui porte un trou, une accolade ou du balisage est insérée telle quelle : elle n'est
  // jamais relue, ni interprétée.
  const composee = composerNotice(
    GABARIT,
    valeurs({ responsable: '{tunnel}', tiers_tunnel: '<b>{x}</b>', transferts: '{{tunnel}}' }),
  );

  expect(composee.sections[0]?.paragraphes).toEqual(['{tunnel}']);
  expect(composee.sections[1]?.liste?.[0]).toBe('<b>{x}</b>');
  expect(composee.sections[1]?.paragraphes?.[0]).toBe('{{tunnel}}');
  // Les accolades qui entourent un trou du gabarit restent, et le trou est rempli.
  expect(
    composerNotice({ titre: '{{tunnel}}', introduction: '', sections: [] }, valeurs()).titre,
  ).toBe('{TUNNEL}');
});

it('composer_retire_une_puce_vide', () => {
  const composee = composerNotice(
    GABARIT,
    valeurs({ responsable: '', tiers_tunnel: '  ', transferts: '', delai_reponse: '' }),
  );

  // La puce vide disparaît, les autres restent dans leur ordre. Une puce faite d'espaces est vide.
  expect(composee.sections[1]?.liste).toEqual(['Fixe.', 'Par TUNNEL, puis TUNNEL encore.']);
  // Un fragment vide ne vide pas sa phrase.
  expect(composee.sections[1]?.paragraphes).toEqual(['Sous .']);
  // Une section dont tous les paragraphes disparaissent garde son titre, sans liste vide.
  expect(composee.sections[0]).toEqual({ titre: 'Qui ?' });
  expect(Object.keys(composee.sections[0] ?? {})).toEqual(['titre']);
});

it('composer_refuse_un_trou_inconnu', () => {
  const avec = (texte: string): Notice => ({ titre: 'T', introduction: texte, sections: [] });

  expect(() => composerNotice(avec('Chez {inconnue}.'), valeurs())).toThrow(
    'trou inconnu dans le gabarit de la notice : {inconnue}',
  );
  // Une clé du prototype d'un objet n'est pas une valeur.
  expect(() => composerNotice(avec('{toString}'), valeurs())).toThrow('{toString}');
  // Une valeur qui manque est un trou inconnu.
  const { tunnel: _tunnel, ...sansTunnel } = valeurs();
  expect(() => composerNotice(GABARIT, sansTunnel)).toThrow('{tunnel}');
});

it('date_affichee_est_la_plus_recente', () => {
  expect(dateAffichee('2026-11-03', '2026-12-01')).toBe('2026-12-01');
  expect(dateAffichee('2026-12-01', '2026-11-03')).toBe('2026-12-01');
  expect(dateAffichee('2026-11-03', '2026-11-03')).toBe('2026-11-03');
});

it('cible_admise_https_ou_mailto_seulement', () => {
  expect(estUneCibleAdmise('https://protection.exemple.test')).toBe(true);
  expect(estUneCibleAdmise('mailto:contact@exemple.test')).toBe(true);
  // Ni une page en clair, ni un script, ni rien : seul le début de la cible compte.
  for (const cible of [
    'http://protection.exemple.test',
    'javascript:alert(1)',
    'HTTPS://protection.exemple.test',
    'voir https://',
    'voir mailto:',
    '',
  ]) {
    expect(estUneCibleAdmise(cible)).toBe(false);
  }
});
