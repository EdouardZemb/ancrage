/*
 * Ce que les tests des onglets lisent et font à l'écran de la même façon (1f-D4 : une seule copie) :
 * la ligne de progression, les boutons d'options, ceux d'une question nommée (un `fieldset` des
 * feuilles) et une touche du clavier. Exclu de la construction, comme tout `*.fixture.*`.
 */
import { fireEvent, screen, within } from '@testing-library/preact';

export function progression(): string {
  return document.querySelector('.progressline')?.textContent ?? '';
}

export function boutons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.options button'));
}

/** Le texte d'une option, sans son numéro. */
export function texteDe(bouton: HTMLButtonElement): string {
  return (bouton.textContent ?? '').replace(/^\d\s+/, '');
}

/** Les boutons d'options du groupe que nomme `groupe` (la question d'une tâche de feuille). */
export function optionsDe(groupe: string): HTMLButtonElement[] {
  return within(screen.getByRole('group', { name: groupe })).getAllByRole(
    'button',
  ) as HTMLButtonElement[];
}

/** Choisit l'option `option` dans le groupe que nomme `groupe`. */
export function choisirDans(groupe: string, option: string): void {
  const choisie = optionsDe(groupe).find((x) => texteDe(x) === option);
  if (choisie === undefined) throw new Error(`« ${groupe} » n'a pas l'option « ${option} »`);
  fireEvent.click(choisie);
}

export function touche(key: string): void {
  fireEvent.keyDown(window, { key });
}
