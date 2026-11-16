/*
 * « Lernplan » (M4, C-D2, C-D6), la vue du semestre d'un cours qui a un planning : le compte à
 * rebours avant l'examen, puis une ligne par étape, dans l'ordre du planning, avec son jour, son
 * état (à venir, ouverte, sûre), son avancement et, pour une étape dépassée, ses cartes neuves à
 * rattraper. Tout se dérive du manifeste, du journal et du jour : rien n'est gardé (invariant 5).
 *
 * L'étape en cours porte `aria-current="step"` et « Jetzt ». L'état se dit en toutes lettres, pas
 * par la seule couleur. Ni pourcentage, ni rouge, ni bouton : rien n'est bloqué, et « Heute » reste
 * l'entrée de la séance. Les titres des étapes sont des textes du cours servi (invariant 3).
 */
import { useMemo } from 'preact/hooks';
import { posablesDuCours } from '../../../domaine/seances/heute.js';
import { joursAvantExamen } from '../../../domaine/seances/planning.js';
import {
  type EtapeDuSemestre,
  etapesDuSemestre,
  jourAffiche,
  modulesDesPosables,
} from '../../../domaine/seances/semestre.js';
import { Barre, ligneDExamen } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { usePlanningDuCours } from '../planning-du-cours.js';
import { formater } from '../textes-cours.js';

/** La classe de la pastille de chaque état : `unit` est le gris neutre, `ok` le vert. */
const CLASSE_D_ETAT = { 'a-venir': 'unit', ouverte: 'frei', sure: 'ok' } as const;

function LigneDEtape(props: { etape: EtapeDuSemestre; rang: number }) {
  const { etape, rang } = props;
  const { t } = useCours();
  const libelles = {
    'a-venir': t.planning_a_venir,
    ouverte: t.planning_ouverte,
    sure: t.planning_sure,
  };
  const meta = [
    etape.etape.genre === 'revision' ? t.planning_revision : undefined,
    formater(t.planning_ab, { datum: jourAffiche(etape.ouverture) }),
    etape.total > 0
      ? formater(t.planning_sicher, { sures: etape.sures, total: etape.total })
      : undefined,
  ].filter((morceau) => morceau !== undefined);
  return (
    <li class="chap" aria-current={etape.enCours ? 'step' : undefined}>
      <span class="num">{rang}</span>
      <span class="title">
        {etape.etape.titre}
        <br />
        <span class="meta">{meta.join(' · ')}</span>
        {etape.retard > 0 && (
          <>
            <br />
            <span class="meta">
              {etape.retard === 1
                ? t.planning_retard_1
                : formater(t.planning_retard_n, { n: etape.retard })}
            </span>
          </>
        )}
      </span>
      <span class="etat">
        {etape.enCours && <span class="pill jetzt">{t.planning_jetzt}</span>}
        <span class={`pill ${CLASSE_D_ETAT[etape.etat]}`}>{libelles[etape.etat]}</span>
      </span>
      {etape.total > 0 && <Barre boites={etape.boites} total={etape.total} />}
    </li>
  );
}

export function Planning() {
  const { cours, t, etats, aujourdhui, preferences } = useCours();
  const posables = useMemo(() => posablesDuCours(cours), [cours]);
  const modules = useMemo(() => modulesDesPosables(cours), [cours]);
  const { planning, depart, examen } = usePlanningDuCours();
  const sens = preferences.cartes.sens;
  const etapes = useMemo(
    () =>
      planning === undefined
        ? []
        : etapesDuSemestre(
            posables,
            modules,
            etats,
            { planning, depart, examen },
            aujourdhui,
            sens,
          ),
    [posables, modules, etats, planning, depart, examen, aujourdhui, sens],
  );
  if (planning === undefined) return null;
  return (
    <section>
      <div class="controls">{ligneDExamen(joursAvantExamen(examen, aujourdhui), t)}</div>
      <ol class="chapters" aria-label={t.onglet_planning}>
        {etapes.map((etape, rang) => (
          <LigneDEtape key={`${rang}-${etape.etape.titre}`} etape={etape} rang={rang + 1} />
        ))}
      </ol>
    </section>
  );
}
