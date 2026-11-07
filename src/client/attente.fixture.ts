/*
 * Une promesse que le test règle quand il veut (1f-D4 : une seule copie). Exclu de la construction,
 * comme tout `*.fixture.*`.
 */
export function enAttente<T>() {
  let regler: (valeur: T) => void = () => {};
  const promesse = new Promise<T>((resolve) => {
    regler = resolve;
  });
  return { promesse, regler };
}
