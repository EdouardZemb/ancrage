/**
 * L'aide se montre après une réponse fausse, et à un rebelle après toute réponse (M9-C2, M9-C3).
 * La carte retournée ne la lit pas : son aide est au verso (M9-C1).
 */
export function montrerLAide(rebelle: boolean, juste: boolean): boolean {
  return rebelle || !juste;
}
