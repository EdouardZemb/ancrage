import { expect, it } from 'vitest';
import { montrerLAide } from './montrer-l-aide.js';

it('montrer_l_aide_apres_une_faute_ou_pour_un_rebelle', () => {
  expect(montrerLAide(false, false)).toBe(true);
  expect(montrerLAide(false, true)).toBe(false);
  expect(montrerLAide(true, true)).toBe(true);
  expect(montrerLAide(true, false)).toBe(true);
});
