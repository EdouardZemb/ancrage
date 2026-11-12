import { expect, it } from 'vitest';
import {
  comparerPositions,
  creerIdEvenement,
  type Evenement,
  fusionnerEvenements,
  MODES_DE_REPONSE,
  schemaEvenement,
  trierEvenements,
  VERSION_EVENEMENT,
} from './evenement.js';
import { horodatage } from './temps.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

const CARTE = 'abcd1234';
const COURS = 'cm5r8t23';
const APPAREIL = '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17';

const REPONSE: Evenement = {
  id: '01929f3a-5b3c-7000-8000-000000000001',
  cours: COURS,
  unite: CARTE,
  type: 'reponse',
  resultat: { juste: true },
  repondu_a: '2026-10-17T08:15:30.250+02:00',
  appareil: APPAREIL,
  v: 1,
};

const EXAMEN: Evenement = {
  ...REPONSE,
  id: '01929f3a-5b3c-7000-8000-000000000002',
  unite: 'exam0001',
  type: 'examen',
  resultat: { points: 18, questions: 24, note: 4.5, minutes: 12, chapitres: 3 },
};

/** Un événement de réponse valide, dont on remplace des champs. */
function reponse(champs: Record<string, unknown> = {}): unknown {
  return { ...REPONSE, ...champs };
}

/** Un événement d'examen valide, dont on remplace des champs du résultat. */
function examen(resultat: Record<string, unknown> = {}): unknown {
  return { ...EXAMEN, resultat: { ...EXAMEN.resultat, ...resultat } };
}

function accepte(valeur: unknown): boolean {
  return schemaEvenement.safeParse(valeur).success;
}

/** Les cas refusés : le nom dit pourquoi, il sert de message en cas d'échec du test. */
function toutRefuse(cas: [string, unknown][]): void {
  for (const [nom, valeur] of cas) expect(accepte(valeur), nom).toBe(false);
}

it('evenement_valide_accepte', () => {
  expect(VERSION_EVENEMENT).toBe(1);
  expect(schemaEvenement.parse(REPONSE)).toEqual(REPONSE);
  expect(schemaEvenement.parse(EXAMEN)).toEqual(EXAMEN);

  // L'unité d'une carte lue à l'envers, un faux, un décalage négatif, tout l'alphabet des
  // identifiants.
  expect(accepte(reponse({ unite: `${CARTE}:inverse` }))).toBe(true);
  expect(accepte(reponse({ resultat: { juste: false } }))).toBe(true);
  expect(accepte(reponse({ repondu_a: '2026-10-17T23:30:00.000-04:00' }))).toBe(true);
  expect(accepte(reponse({ repondu_a: '2028-02-29T00:00:00.000+00:00' }))).toBe(true);
  expect(accepte(reponse({ unite: '01234567', cours: '89abcdef' }))).toBe(true);
  expect(accepte(reponse({ unite: 'ghjkmnpq', cours: 'rstvwxyz' }))).toBe(true);

  // Un id fabriqué par `creerIdEvenement`.
  const id = creerIdEvenement(Date.UTC(2026, 9, 17), new Uint8Array(10).fill(0xab));
  expect(accepte(reponse({ id }))).toBe(true);
});

it('le_mode_d_une_reponse_est_facultatif_et_ferme', () => {
  // La liste de M3-P2, dans son ordre : un mode ajouté ou retiré change le format du journal.
  expect(MODES_DE_REPONSE).toEqual([
    'retournee',
    'saisie',
    'corrigee',
    'choix',
    'assemblage',
    'pointage',
    'association',
    'montree',
    'lecture',
  ]);
  // Sans mode, accepté, et rendu sans la clé.
  expect(schemaEvenement.parse(REPONSE)).not.toHaveProperty('mode');
  // Avec chacun des modes, accepté, et conservé.
  for (const mode of MODES_DE_REPONSE) {
    const evenement = reponse({ resultat: { juste: false, mode } });
    expect(accepte(evenement), mode).toBe(true);
    expect(schemaEvenement.parse(evenement)).toEqual(evenement);
  }
  toutRefuse([
    ['un mode inconnu', reponse({ resultat: { juste: true, mode: 'devinee' } })],
    ['un mode vide', reponse({ resultat: { juste: true, mode: '' } })],
    ["un mode qui n'est pas un texte", reponse({ resultat: { juste: true, mode: 1 } })],
    ['un mode en majuscules', reponse({ resultat: { juste: true, mode: 'Saisie' } })],
    [
      'un mode et une autre clé',
      reponse({ resultat: { juste: true, mode: 'saisie', saisie: 'x' } }),
    ],
    ['un mode seul, sans juste', reponse({ resultat: { mode: 'saisie' } })],
    ["un mode dans le résultat d'un examen", examen({ mode: 'saisie' })],
  ]);
  // Le format n'a pas changé : un serveur d'avant refuserait tout autre `v`.
  expect(accepte(reponse({ v: 2, resultat: { juste: true, mode: 'saisie' } }))).toBe(false);
});

it('champ_personne_refuse', () => {
  toutRefuse([
    ['personne', reponse({ personne: 'p0000001' })],
    ['recu_a', reponse({ recu_a: '2026-10-17T08:15:31.000+02:00' })],
    ['un champ inconnu', reponse({ saisie: 'Herz' })],
    ['un champ inconnu dans le résultat', reponse({ resultat: { juste: true, saisie: 'Herz' } })],
    ['un champ inconnu dans un examen', examen({ saisie: 'Herz' })],
  ]);
});

it('champs_manquants_ou_mal_types_refuses', () => {
  const sans = (champ: string): unknown => {
    const { [champ]: _retire, ...reste } = REPONSE as unknown as Record<string, unknown>;
    return reste;
  };
  toutRefuse([
    ['id absent', sans('id')],
    ['cours absent', sans('cours')],
    ['unite absente', sans('unite')],
    ['type absent', sans('type')],
    ['resultat absent', sans('resultat')],
    ['repondu_a absent', sans('repondu_a')],
    ['appareil absent', sans('appareil')],
    ['v absent', sans('v')],
    ['v vaut 2', reponse({ v: 2 })],
    ['v vaut "1"', reponse({ v: '1' })],
    ['type inconnu', reponse({ type: 'abandon' })],
    ['pas un objet', 'reponse'],
    ['null', null],
    ['un tableau', [REPONSE]],
    ["juste n'est pas un booléen", reponse({ resultat: { juste: 1 } })],
    ['juste absent', reponse({ resultat: {} })],
    ["un résultat d'examen sur une réponse", reponse({ resultat: EXAMEN.resultat })],
    ['un résultat de réponse sur un examen', { ...EXAMEN, resultat: { juste: true } }],
  ]);
});

it('cours_et_unite_au_format_des_identifiants', () => {
  toutRefuse([
    ['cours trop court', reponse({ cours: 'cm5r8t2' })],
    ['cours trop long', reponse({ cours: 'cm5r8t234' })],
    ['cours en majuscules', reponse({ cours: 'CM5R8T23' })],
    ['cours avec un i', reponse({ cours: 'cm5r8t2i' })],
    ['cours avec un espace', reponse({ cours: 'cm5r8 23' })],
    ["cours précédé d'un retour à la ligne", reponse({ cours: `\n${COURS}` })],
    ["cours suivi d'un retour à la ligne", reponse({ cours: `${COURS}\n` })],
    ['cours vide', reponse({ cours: '' })],
    ['unite trop courte', reponse({ unite: 'abcd123' })],
    ['unite trop longue', reponse({ unite: 'abcd12345' })],
    ['unite en majuscules', reponse({ unite: 'ABCD1234' })],
    ['unite avec un u', reponse({ unite: 'abcd123u' })],
    ['unite vide', reponse({ unite: '' })],
    ['unite : sens inverse seul', reponse({ unite: ':inverse' })],
    ['unite : suffixe sans identifiant', reponse({ unite: 'inverse' })],
    ['unite : deux points seuls', reponse({ unite: `${CARTE}:` })],
    ['unite : suffixe inconnu', reponse({ unite: `${CARTE}:direct` })],
    ['unite : suffixe en majuscule', reponse({ unite: `${CARTE}:Inverse` })],
    ['unite : suffixe prolongé', reponse({ unite: `${CARTE}:inverses` })],
    ['unite : suffixe doublé', reponse({ unite: `${CARTE}:inverse:inverse` })],
    ['unite : identifiant trop long avant le suffixe', reponse({ unite: `${CARTE}x:inverse` })],
    ['unite : identifiant trop court avant le suffixe', reponse({ unite: 'abcd123:inverse' })],
    ['unite : suffixe sans deux points', reponse({ unite: `${CARTE}inverse` })],
    ["unite : suffixe suivi d'un retour à la ligne", reponse({ unite: `${CARTE}:inverse\n` })],
    ['unite : pas un texte', reponse({ unite: 12345678 })],
  ]);
});

it('id_non_v7_refuse', () => {
  toutRefuse([
    ['uuid v4', reponse({ id: '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17' })],
    ['version 6', reponse({ id: '01929f3a-5b3c-6000-8000-000000000001' })],
    ['version 8', reponse({ id: '01929f3a-5b3c-8000-8000-000000000001' })],
    ['variante 7', reponse({ id: '01929f3a-5b3c-7000-7000-000000000001' })],
    ['variante c', reponse({ id: '01929f3a-5b3c-7000-c000-000000000001' })],
    ['majuscules', reponse({ id: '01929F3A-5B3C-7000-8000-000000000001' })],
    ['sans tirets', reponse({ id: '01929f3a5b3c70008000000000000001' })],
    ['un chiffre de trop', reponse({ id: '01929f3a-5b3c-7000-8000-0000000000012' })],
    ['un chiffre de moins', reponse({ id: '01929f3a-5b3c-7000-8000-00000000001' })],
    ['un chiffre de trop au début', reponse({ id: '001929f3a-5b3c-7000-8000-000000000001' })],
    ['pas hexadécimal', reponse({ id: '01929f3a-5b3c-7000-8000-00000000000g' })],
    ["précédé d'un retour à la ligne", reponse({ id: '\n01929f3a-5b3c-7000-8000-000000000001' })],
    ["suivi d'un retour à la ligne", reponse({ id: '01929f3a-5b3c-7000-8000-000000000001\n' })],
    ['vide', reponse({ id: '' })],
    ['un identifiant de carte', reponse({ id: CARTE })],
  ]);
  for (const variante of ['8', '9', 'a', 'b']) {
    const id = `01929f3a-5b3c-7000-${variante}000-000000000001`;
    expect(accepte(reponse({ id })), variante).toBe(true);
  }
});

it('repondu_a_sans_decalage_refuse', () => {
  toutRefuse([
    ['Z', reponse({ repondu_a: '2026-10-17T08:15:30.250Z' })],
    ['aucun décalage', reponse({ repondu_a: '2026-10-17T08:15:30.250' })],
    ['décalage sans minutes', reponse({ repondu_a: '2026-10-17T08:15:30.250+02' })],
    ['décalage sans deux points', reponse({ repondu_a: '2026-10-17T08:15:30.250+0200' })],
    ['pas de millisecondes', reponse({ repondu_a: '2026-10-17T08:15:30+02:00' })],
    ['millisecondes sur deux chiffres', reponse({ repondu_a: '2026-10-17T08:15:30.25+02:00' })],
    ['microsecondes', reponse({ repondu_a: '2026-10-17T08:15:30.250000+02:00' })],
    ['espace au lieu de T', reponse({ repondu_a: '2026-10-17 08:15:30.250+02:00' })],
    ['t minuscule', reponse({ repondu_a: '2026-10-17t08:15:30.250+02:00' })],
    ['jour seul', reponse({ repondu_a: '2026-10-17' })],
    ['année sur deux chiffres', reponse({ repondu_a: '26-10-17T08:15:30.250+02:00' })],
    ['année sur cinq chiffres', reponse({ repondu_a: '12026-10-17T08:15:30.250+02:00' })],
    ['mois sur un chiffre', reponse({ repondu_a: '2026-1-17T08:15:30.250+02:00' })],
    ['jour sur un chiffre', reponse({ repondu_a: '2026-10-7T08:15:30.250+02:00' })],
    ['heure sur un chiffre', reponse({ repondu_a: '2026-10-17T8:15:30.250+02:00' })],
    ['signe inconnu', reponse({ repondu_a: '2026-10-17T08:15:30.250*02:00' })],
    ['texte avant', reponse({ repondu_a: ' 2026-10-17T08:15:30.250+02:00' })],
    ['texte après', reponse({ repondu_a: '2026-10-17T08:15:30.250+02:00 ' })],
    ['retour à la ligne avant', reponse({ repondu_a: '\n2026-10-17T08:15:30.250+02:00' })],
    ['retour à la ligne après', reponse({ repondu_a: '2026-10-17T08:15:30.250+02:00\n' })],
    ['pas un texte', reponse({ repondu_a: 1760685330250 })],
    ['vide', reponse({ repondu_a: '' })],
  ]);
});

it('date_inexistante_refusee', () => {
  toutRefuse([
    ['30 février', reponse({ repondu_a: '2026-02-30T10:00:00.000+02:00' })],
    ["29 février d'une année ordinaire", reponse({ repondu_a: '2026-02-29T10:00:00.000+02:00' })],
    ["29 février d'un siècle ordinaire", reponse({ repondu_a: '2100-02-29T10:00:00.000+02:00' })],
    ['31 avril', reponse({ repondu_a: '2026-04-31T10:00:00.000+02:00' })],
    ['mois 13', reponse({ repondu_a: '2026-13-01T10:00:00.000+02:00' })],
    ['mois 00', reponse({ repondu_a: '2026-00-10T10:00:00.000+02:00' })],
    ['jour 00', reponse({ repondu_a: '2026-10-00T10:00:00.000+02:00' })],
    ['jour 32', reponse({ repondu_a: '2026-10-32T10:00:00.000+02:00' })],
    ['heure 24', reponse({ repondu_a: '2026-10-17T24:00:00.000+02:00' })],
    ['heure 25', reponse({ repondu_a: '2026-10-17T25:00:00.000+02:00' })],
    ['minute 60', reponse({ repondu_a: '2026-10-17T10:60:00.000+02:00' })],
    ['seconde 60', reponse({ repondu_a: '2026-10-17T10:00:60.000+02:00' })],
    ['minutes de décalage 60', reponse({ repondu_a: '2026-10-17T10:00:00.000+02:60' })],
    ['heures de décalage 24', reponse({ repondu_a: '2026-10-17T10:00:00.000+24:00' })],
    ['moins zéro', reponse({ repondu_a: '2026-10-17T10:00:00.000-00:00' })],
  ]);
  // Le dernier instant de la journée, un 29 février existant, des décalages extrêmes.
  expect(accepte(reponse({ repondu_a: '2026-10-17T23:59:59.999+02:00' }))).toBe(true);
  expect(accepte(reponse({ repondu_a: '2028-02-29T10:00:00.000+02:00' }))).toBe(true);
  expect(accepte(reponse({ repondu_a: '2026-10-17T10:00:00.000+23:59' }))).toBe(true);
  expect(accepte(reponse({ repondu_a: '2026-12-31T00:00:00.000-12:00' }))).toBe(true);
});

it('appareil_est_un_uuid', () => {
  expect(accepte(reponse({ appareil: '00000000-0000-4000-8000-000000000000' }))).toBe(true);
  expect(accepte(reponse({ appareil: 'abcdef01-2345-6789-abcd-ef0123456789' }))).toBe(true);
  toutRefuse([
    ['vide', reponse({ appareil: '' })],
    ['pas un uuid', reponse({ appareil: 'telephone-de-testa' })],
    ['sans tirets', reponse({ appareil: '4b3f0a527c1e4d689a215e8f6c0d3b17' })],
    ['majuscules', reponse({ appareil: '4B3F0A52-7C1E-4D68-9A21-5E8F6C0D3B17' })],
    ['un chiffre de trop', reponse({ appareil: '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b170' })],
    ['un chiffre de moins', reponse({ appareil: '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b1' })],
    ['un chiffre de trop au début', reponse({ appareil: '04b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17' })],
    ['pas hexadécimal', reponse({ appareil: '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b1g' })],
    ["précédé d'un retour à la ligne", reponse({ appareil: `\n${APPAREIL}` })],
    ["suivi d'un retour à la ligne", reponse({ appareil: `${APPAREIL}\n` })],
    ['absent', { ...REPONSE, appareil: undefined }],
  ]);
});

it('resultat_d_examen_incoherent_refuse', () => {
  expect(accepte(EXAMEN)).toBe(true);
  // Les bornes permises : tout juste, tout faux, la plus petite durée, aucun chapitre.
  expect(accepte(examen({ points: 24 }))).toBe(true);
  expect(accepte(examen({ points: 0 }))).toBe(true);
  expect(accepte(examen({ points: 1, questions: 1, minutes: 1, chapitres: 0 }))).toBe(true);
  expect(accepte(examen({ note: 1 }))).toBe(true);
  expect(accepte(examen({ note: 6 }))).toBe(true);
  expect(accepte(examen({ note: 3.5 }))).toBe(true);
  expect(accepte(examen({ note: 5 }))).toBe(true);

  toutRefuse([
    ['points > questions', examen({ points: 25 })],
    ['points > questions, loin', examen({ points: 99, questions: 24 })],
    ['note de 4.3', examen({ note: 4.3 })],
    ['note de 4.25', examen({ note: 4.25 })],
    ['note de 4.75', examen({ note: 4.75 })],
    ['note sous 1', examen({ note: 0.5 })],
    ['note de 0', examen({ note: 0 })],
    ['note négative', examen({ note: -1 })],
    ['note de 6.5', examen({ note: 6.5 })],
    ['note de 7', examen({ note: 7 })],
    ['note NaN', examen({ note: Number.NaN })],
    ['note infinie', examen({ note: Number.POSITIVE_INFINITY })],
    ['note en texte', examen({ note: '4.5' })],
    ['points fractionnaires', examen({ points: 17.5 })],
    ['points négatifs', examen({ points: -1 })],
    ['points en texte', examen({ points: '18' })],
    ['questions fractionnaires', examen({ questions: 24.5 })],
    ['aucune question', examen({ points: 0, questions: 0 })],
    ['questions négatives', examen({ points: 0, questions: -1 })],
    ['minutes fractionnaires', examen({ minutes: 12.5 })],
    ['aucune minute', examen({ minutes: 0 })],
    ['minutes négatives', examen({ minutes: -3 })],
    ['chapitres fractionnaires', examen({ chapitres: 2.5 })],
    ['chapitres négatifs', examen({ chapitres: -1 })],
    ['points absents', examen({ points: undefined })],
    ['questions absentes', examen({ questions: undefined })],
    ['note absente', examen({ note: undefined })],
    ['minutes absentes', examen({ minutes: undefined })],
    ['chapitres absents', examen({ chapitres: undefined })],
  ]);
});

/** Les octets aléatoires d'un test, tous égaux à `valeur`. */
const octets = (valeur: number): Uint8Array => new Uint8Array(10).fill(valeur);

it('creer_id_evenement_est_un_uuidv7_croissant_avec_l_instant', () => {
  // Aucun bit aléatoire à 1 : seuls la version (7) et la variante (10) sont fixées.
  expect(creerIdEvenement(0, octets(0))).toBe('00000000-0000-7000-8000-000000000000');
  // La version et la variante masquent le début de l'aléa ; le reste passe tel quel.
  expect(creerIdEvenement(0, octets(0xff))).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  // L'instant sur 48 bits, gros-boutiste ; l'aléa octet par octet.
  const aleatoire = Uint8Array.of(0xff, 0xee, 0xff, 1, 2, 3, 4, 5, 6, 7);
  expect(creerIdEvenement(0x0123456789ab, aleatoire)).toBe('01234567-89ab-7fee-bf01-020304050607');
  const autre = Uint8Array.of(0x1a, 0x2b, 0x4c, 0x5d, 0x6e, 0x7f, 8, 9, 10, 11);
  expect(creerIdEvenement(0x0123456789ab, autre)).toBe('01234567-89ab-7a2b-8c5d-6e7f08090a0b');
  expect(creerIdEvenement(2 ** 48 - 1, octets(0))).toBe('ffffffff-ffff-7000-8000-000000000000');

  // Un instant réel : le préfixe est l'instant en hexadécimal.
  const instant = Date.UTC(2026, 9, 17, 6, 15, 30, 250);
  const id = creerIdEvenement(instant, octets(0x5a));
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(instant);

  // Croissant avec l'instant, quel que soit l'aléa : l'instant décide, l'aléa départage.
  const instants = [0, 1, 255, 256, 65_535, 65_536, 2 ** 40, instant, instant + 1, 2 ** 48 - 1];
  for (let i = 1; i < instants.length; i++) {
    const avant = creerIdEvenement(instants[i - 1], octets(0xff));
    const apres = creerIdEvenement(instants[i], octets(0));
    expect(avant < apres, `${instants[i - 1]} puis ${instants[i]}`).toBe(true);
  }

  // Ce que `schemaEvenement` exige d'un id.
  for (const t of instants) {
    expect(accepte(reponse({ id: creerIdEvenement(t, octets(0xc3)) })), String(t)).toBe(true);
  }
});

it('creer_id_evenement_refuse_un_instant_ou_un_alea_impossible', () => {
  const instantImpossible = (instant: number) => () => creerIdEvenement(instant, octets(0));
  expect(instantImpossible(-1)).toThrow(RangeError);
  expect(instantImpossible(-1)).toThrow(/48 bits/);
  expect(instantImpossible(2 ** 48)).toThrow(/48 bits/);
  expect(instantImpossible(1.5)).toThrow(/48 bits/);
  expect(instantImpossible(Number.NaN)).toThrow(/48 bits/);
  expect(instantImpossible(Number.POSITIVE_INFINITY)).toThrow(/48 bits/);

  const aleaImpossible = (octetsTires: number) => () =>
    creerIdEvenement(0, new Uint8Array(octetsTires));
  expect(aleaImpossible(9)).toThrow(RangeError);
  expect(aleaImpossible(9)).toThrow(/10 octets/);
  expect(aleaImpossible(11)).toThrow(/10 octets/);
  expect(aleaImpossible(0)).toThrow(/10 octets/);
});

/** Un événement de réponse, dont on remplace des champs. */
function evt(champs: Partial<Evenement> & { id: string; repondu_a: string }): Evenement {
  return { ...REPONSE, ...champs } as Evenement;
}

const ID = (n: number): string => `01929f3a-5b3c-7000-8000-${String(n).padStart(12, '0')}`;

it('tri_par_instant_puis_id', () => {
  // Le 17 à 00:30 (+02:00) est le 16 à 22:30 UTC : avant le 16 à 23:00 UTC, bien que son texte
  // soit plus grand.
  const tot = evt({ id: ID(2), repondu_a: '2026-10-17T00:30:00.000+02:00' });
  const tard = evt({ id: ID(1), repondu_a: '2026-10-16T23:00:00.000+00:00' });
  expect(trierEvenements([tard, tot])).toEqual([tot, tard]);
  expect(trierEvenements([tot, tard])).toEqual([tot, tard]);

  // Des instants égaux, écrits avec des décalages différents : l'id départage.
  const a = evt({ id: ID(3), repondu_a: '2026-10-17T02:00:00.000+02:00' });
  const b = evt({ id: ID(4), repondu_a: '2026-10-16T22:00:00.000-02:00' });
  const c = evt({ id: ID(5), repondu_a: '2026-10-17T00:00:00.000+00:00' });
  expect(Date.parse(a.repondu_a)).toBe(Date.parse(b.repondu_a));
  expect(Date.parse(a.repondu_a)).toBe(Date.parse(c.repondu_a));
  expect(trierEvenements([c, b, a])).toEqual([a, b, c]);
  expect(trierEvenements([b, c, a])).toEqual([a, b, c]);
  expect(trierEvenements([a, b, c])).toEqual([a, b, c]);

  // Les millisecondes comptent.
  const m1 = evt({ id: ID(9), repondu_a: '2026-10-17T10:00:00.001+02:00' });
  const m2 = evt({ id: ID(8), repondu_a: '2026-10-17T10:00:00.002+02:00' });
  expect(trierEvenements([m2, m1])).toEqual([m1, m2]);

  // L'instant l'emporte sur l'id, dans les deux sens.
  const premier = evt({ id: ID(7), repondu_a: '2026-10-17T10:00:00.000+02:00' });
  const second = evt({ id: ID(6), repondu_a: '2026-10-17T10:00:01.000+02:00' });
  expect(trierEvenements([second, premier])).toEqual([premier, second]);
  expect(trierEvenements([premier, second])).toEqual([premier, second]);
});

it('tri_d_un_grand_journal_conforme_a_la_reference', () => {
  // 200 événements sur 25 instants, écrits avec trois décalages : beaucoup d'instants égaux, que
  // l'id départage. La référence trie une clé de texte, sans comparateur.
  let graine = 20261017;
  const suivant = (): number => {
    graine = (graine * 48271) % 2147483647;
    return graine;
  };
  const decalages = [120, -240, 0];
  const lignes = Array.from({ length: 200 }, (_, i) => {
    const instant = Date.UTC(2026, 9, 17, 6, 0, 0) + (suivant() % 25) * 60_000;
    const decalage = decalages[suivant() % decalages.length];
    const evenement = evt({ id: ID(i), repondu_a: horodatage(instant, decalage) });
    return { evenement, cle: `${instant}|${evenement.id}` };
  });
  for (let i = lignes.length - 1; i > 0; i--) {
    const j = suivant() % (i + 1);
    [lignes[i], lignes[j]] = [lignes[j], lignes[i]];
  }
  const attendu = lignes
    .map((ligne) => ligne.cle)
    .sort()
    .map((cle) => cle.slice(cle.indexOf('|') + 1));
  const triee = trierEvenements(lignes.map((ligne) => ligne.evenement));
  expect(triee.map((e) => e.id)).toEqual(attendu);
  expect(new Set(triee.map((e) => e.id)).size).toBe(200);
});

it('tri_laisse_l_entree_intacte', () => {
  const tard = evt({ id: ID(1), repondu_a: '2026-10-17T10:00:00.000+02:00' });
  const tot = evt({ id: ID(2), repondu_a: '2026-10-17T09:00:00.000+02:00' });
  const entree = [tard, tot];
  const triee = trierEvenements(entree);
  expect(triee).toEqual([tot, tard]);
  expect(triee).not.toBe(entree);
  expect(entree).toEqual([tard, tot]);

  expect(trierEvenements([])).toEqual([]);

  const dehors = evt({ id: ID(3), repondu_a: '2026-10-17T12:00:00.000+02:00' });
  const dedans = evt({ id: ID(2), repondu_a: '2026-10-17T11:00:00.000+02:00' });
  const desordre = [dehors, dedans];
  trierEvenements(desordre);
  expect(desordre).toEqual([dehors, dedans]);
});

// F2 : le comparateur, testé seul (voir son commentaire) : l'instant, puis l'`id`, et 0 à `id` égal.
it('comparateur_par_instant_puis_id_zero_a_egalite', () => {
  const position = (instant: number, id: string) => ({ instant, id });

  expect(comparerPositions(position(1, ID(9)), position(2, ID(1)))).toBeLessThan(0);
  expect(comparerPositions(position(2, ID(1)), position(1, ID(9)))).toBeGreaterThan(0);
  expect(comparerPositions(position(5, ID(1)), position(5, ID(2)))).toBe(-1);
  expect(comparerPositions(position(5, ID(2)), position(5, ID(1)))).toBe(1);
  // Un doublon, hors contrat : ni avant ni après.
  expect(comparerPositions(position(5, ID(3)), position(5, ID(3)))).toBe(0);
});

it('fusion_sans_doublon_meme_resultat_quel_que_soit_l_ordre', () => {
  const e1 = evt({ id: ID(1), repondu_a: '2026-10-17T08:00:00.000+02:00' });
  const e2 = evt({ id: ID(2), repondu_a: '2026-10-17T09:00:00.000+02:00' });
  const e3 = evt({ id: ID(3), repondu_a: '2026-10-17T03:30:00.000-04:00' });
  const e4 = evt({ id: ID(4), repondu_a: '2026-10-17T03:30:00.000-04:00' });
  const e5 = evt({ id: ID(5), repondu_a: '2026-10-16T23:00:00.000+00:00' });

  // e2 et e3 sont chez les deux. En UTC : e5 le 16 à 23:00, e1 à 06:00, e2 à 07:00, puis e3 et
  // e4 à 07:30 (départagés par l'id).
  const a = [e3, e1, e2];
  const b = [e5, e2, e4, e3];
  const attendu = [e5, e1, e2, e3, e4];
  expect(fusionnerEvenements(a, b)).toEqual(attendu);
  expect(fusionnerEvenements(b, a)).toEqual(attendu);

  // Idempotente, neutre pour le vide, et les entrées ne bougent pas.
  expect(fusionnerEvenements(attendu, attendu)).toEqual(attendu);
  expect(fusionnerEvenements(a, [])).toEqual(trierEvenements(a));
  expect(fusionnerEvenements([], b)).toEqual(trierEvenements(b));
  expect(fusionnerEvenements([], [])).toEqual([]);
  expect(a).toEqual([e3, e1, e2]);
  expect(b).toEqual([e5, e2, e4, e3]);

  // Un doublon dans une même liste n'est gardé qu'une fois.
  expect(fusionnerEvenements([e1, e1], [e1])).toEqual([e1]);
});

it('fusion_garde_le_premier_recu_a_id_egal', () => {
  const premier = evt({ id: ID(1), repondu_a: '2026-10-17T08:00:00.000+02:00', unite: 'aaaaaaaa' });
  const autre = evt({ id: ID(1), repondu_a: '2026-10-17T08:00:00.000+02:00', unite: 'bbbbbbbb' });
  expect(fusionnerEvenements([premier], [autre])).toEqual([premier]);
  expect(fusionnerEvenements([autre], [premier])).toEqual([autre]);
  expect(fusionnerEvenements([premier, autre], [])).toEqual([premier]);
});
