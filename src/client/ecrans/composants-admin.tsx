/*
 * Ce que les formulaires de l'administration partagent côté composants : la case à cocher et la
 * bascule d'un identifiant dans un ensemble. (`admin-commun.ts` tient les libellés et les types.)
 */

export function Case(props: { libelle: string; cochee: boolean; onChange: () => void }) {
  return (
    <label class="case">
      <input type="checkbox" checked={props.cochee} onChange={props.onChange} />
      {props.libelle}
    </label>
  );
}

/** Le même ensemble, avec `id` en plus ou en moins. */
export function basculer(ensemble: ReadonlySet<string>, id: string): Set<string> {
  const suivant = new Set(ensemble);
  if (!suivant.delete(id)) {
    suivant.add(id);
  }
  return suivant;
}
