import { expect, it } from 'vitest';
import { prendreLaMainALInstallation } from './sw-protocole.js';

it('demarrage_prend_la_main_sur_une_version_sans_protocole', () => {
  expect(prendreLaMainALInstallation({ versionActive: true, protocoleConnu: false })).toBe(true);
});

it('ensuite_attend_le_message', () => {
  expect(prendreLaMainALInstallation({ versionActive: true, protocoleConnu: true })).toBe(false);
});

it('premiere_installation_n_a_rien_a_remplacer', () => {
  expect(prendreLaMainALInstallation({ versionActive: false, protocoleConnu: false })).toBe(false);
});
