/*
 * « Übersicht », l'aperçu du cours, repris du prototype (`renderHome`, H:1712-1739) : quatre
 * chiffres, la série, un chapitre par module de cartes avec sa barre et « Lernen », la légende des
 * boîtes, puis les autres exercices du cours avec leur sous-titre (décision 19), les feuilles
 * comprises (F1-D12).
 *
 * Quand le cours range ses chapitres par manuel, il y a une section par manuel, dans l'ordre de
 * `manuels`, puis « Übungen » ; sinon « Kapitel » puis « Weitere Übungen » (A2-D5 à A2-D9).
 *
 * Un chiffre, une ligne ou une section n'apparaît que si le cours a le module qu'elle décrit : un
 * cours sans mots n'a pas de « Wörter zerlegt », un cours sans examen pas de note.
 */
import { useMemo } from 'preact/hooks';
import { divisionsDuCours, numeroAffiche } from '../../../domaine/cours/manuels.js';
import type { Chapitre, CoursPrepare, Onglet } from '../../../domaine/cours/prepare.js';
import { dernieresReponses, scoreDeFeuille } from '../../../domaine/feuilles/deroulement.js';
import { examensPasses, reponsesParJour, serie } from '../../../domaine/progression/etat.js';
import { reussis, statistiquesDeChapitre } from '../../../domaine/progression/statistiques.js';
import { unitesDuChoix } from '../../../domaine/seances/cartes.js';
import { duesDuJour, posablesDuCours } from '../../../domaine/seances/heute.js';
import { Avancement, enGras } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { formater } from '../textes-cours.js';

/** La couleur de chaque boîte, de 0 (neuve) à 5 (H:1700). */
const COULEUR_DES_BOITES = ['--box1', '--box1', '--box2', '--box3', '--box4', '--box5'];
const BOITES_REMPLIES = [1, 2, 3, 4, 5];
/** La note quand aucun examen n'a été remis. */
const SANS_NOTE = '–';

/** La barre d'un chapitre : la part de chaque boîte de 1 à 5 ; les neuves restent au fond. */
function Barre(props: { boites: number[]; total: number }) {
  const { boites, total } = props;
  return (
    <div class="bar" aria-hidden="true">
      {total > 0 &&
        BOITES_REMPLIES.map(
          (boite) =>
            boites[boite] > 0 && (
              <i
                key={boite}
                style={{
                  width: `${(boites[boite] / total) * 100}%`,
                  background: `var(${COULEUR_DES_BOITES[boite]})`,
                }}
              />
            ),
        )}
    </div>
  );
}

function Chiffre(props: { valeur: string | number; sur?: number; libelle: string }) {
  return (
    <div class="stat">
      <b>
        {props.valeur}
        {props.sur !== undefined && <span class="muted sur"> / {props.sur}</span>}
      </b>
      <span>{props.libelle}</span>
    </div>
  );
}

/** Une ligne d'exercice : un module qui n'est pas un chapitre, et son geste d'ouverture. */
interface AutreExercice {
  onglet: Onglet;
  nom: string;
  sousTitre: string | undefined;
  faits: number;
  total: number;
  ouvrir: () => void;
}

/** Une section de l'écran : son intertitre, ses chapitres, puis ses lignes d'exercices. */
interface Section {
  id: string;
  titre: string;
  chapitres: Chapitre[];
  exercices: AutreExercice[];
}

function LigneDeChapitre(props: { chapitre: Chapitre; avecUnit: boolean }) {
  const { chapitre, avecUnit } = props;
  const {
    cours,
    t,
    etats,
    aujourdhui,
    preferences,
    changerPreferences,
    aller,
    oublierEtatDOnglet,
  } = useCours();
  const st = statistiquesDeChapitre(unitesDuChoix(cours, chapitre.id, 'mix'), etats, aujourdhui);
  const lernen = () => {
    changerPreferences({
      ...preferences,
      cartes: { ...preferences.cartes, chapitre: chapitre.id },
    });
    // Une série neuve, même sur le chapitre de la série en cours (H:1738).
    oublierEtatDOnglet('cartes');
    aller('cartes');
  };
  return (
    <li class="chap">
      <span class="num">{numeroAffiche(chapitre)}</span>
      <span class="title">
        {chapitre.titre}
        {avecUnit && chapitre.unit !== undefined && (
          <>
            {' '}
            <span class="pill unit">{formater(t.apercu_unit, { n: chapitre.unit })}</span>
          </>
        )}
        <br />
        <span class="meta">
          {formater(t.apercu_chapitre, {
            sures: st.sures,
            total: st.total,
            dues: st.dues,
            neues: st.boites[0],
          })}
        </span>
      </span>
      <button type="button" class="small-btn" onClick={lernen}>
        {t.apercu_lernen}
      </button>
      <Barre boites={st.boites} total={st.total} />
    </li>
  );
}

function LigneDExercice(props: { exercice: AutreExercice }) {
  const { exercice } = props;
  const { t } = useCours();
  return (
    <li class="chap">
      <span class="num" aria-hidden="true">
        ·
      </span>
      <span class="title">
        {exercice.nom}
        <br />
        <span class="meta">
          {[exercice.sousTitre, `${exercice.faits}/${exercice.total}`]
            .filter((morceau) => morceau !== undefined && morceau !== '')
            .join(' · ')}
        </span>
      </span>
      <button type="button" class="small-btn" onClick={exercice.ouvrir}>
        {t.apercu_ueben}
      </button>
      <Avancement faits={exercice.faits} total={exercice.total} />
    </li>
  );
}

function SectionDeLApercu(props: { section: Section; avecUnit: boolean }) {
  const { section, avecUnit } = props;
  if (section.chapitres.length + section.exercices.length === 0) return null;
  return (
    <>
      <h2 id={section.id}>{section.titre}</h2>
      <ul class="chapters" aria-labelledby={section.id}>
        {section.chapitres.map((chapitre) => (
          <LigneDeChapitre key={chapitre.id} chapitre={chapitre} avecUnit={avecUnit} />
        ))}
        {section.exercices.map((exercice) => (
          <LigneDExercice key={exercice.onglet} exercice={exercice} />
        ))}
      </ul>
    </>
  );
}

function Legende() {
  const { t } = useCours();
  return (
    <div class="legend">
      <span>
        <i style={{ background: 'var(--box1)' }} />
        {t.apercu_legende_neu}
      </span>
      {[2, 3].map((boite) => (
        <span key={boite}>
          <i style={{ background: `var(${COULEUR_DES_BOITES[boite]})` }} />
          {formater(t.apercu_legende_fach, { n: boite })}
        </span>
      ))}
      {[4, 5].map((boite) => (
        <span key={boite}>
          <i style={{ background: `var(${COULEUR_DES_BOITES[boite]})` }} />
          {formater(t.apercu_legende_sicher, { n: boite })}
        </span>
      ))}
    </div>
  );
}

export function Apercu() {
  const { cours, t, evenements, etats, aujourdhui, preferences, changerPreferences, aller } =
    useCours();
  const parJour = useMemo(() => reponsesParJour(evenements), [evenements]);
  const dernierExamen = useMemo(() => examensPasses(evenements).at(-1), [evenements]);
  const dernieres = useMemo(() => dernieresReponses(evenements), [evenements]);

  const tout = statistiquesDeChapitre(cours.unites, etats, aujourdhui);
  // « À revoir aujourd'hui » est le compte de « Heute » : tout ce que la séance peut poser (M2-P5).
  const dues = useMemo(
    () => duesDuJour(posablesDuCours(cours), etats, aujourdhui).length,
    [cours, etats, aujourdhui],
  );
  const { morphologie, textes, exercices, feuilles } = cours;

  /**
   * La ligne des schémas donnés. « Üben » choisit d'abord le premier schéma de la ligne si le
   * choix gardé n'en est pas un (A2-D9) ; avec tous les schémas du cours, le choix gardé en est
   * toujours un.
   */
  const ligneDeSchemas = (schemas: CoursPrepare['schemas']) => {
    const points = schemas.flatMap((schema) => schema.points.map(({ id }) => id));
    return {
      onglet: 'schemas',
      nom: t.onglet_schemas,
      sousTitre: schemas.map(({ titre }) => titre).join(' · '),
      faits: reussis(points, etats),
      total: points.length,
      ouvrir: () => {
        if (!schemas.some(({ id }) => id === preferences.schemas.schema)) {
          changerPreferences({
            ...preferences,
            schemas: { ...preferences.schemas, schema: schemas[0].id },
          });
        }
        aller('schemas');
      },
    } satisfies AutreExercice;
  };

  /** Les lignes d'exercices, à leur place d'aujourd'hui ; la ligne des schémas est donnée. */
  const lignesDExercices = (schemas: AutreExercice | undefined): AutreExercice[] => {
    const lignes: AutreExercice[] = [];
    const ajouter = (
      onglet: Onglet,
      bloc: { titre: string; description?: string },
      ids: string[],
    ) =>
      lignes.push({
        onglet,
        nom: bloc.titre,
        sousTitre: bloc.description,
        faits: reussis(ids, etats),
        total: ids.length,
        ouvrir: () => aller(onglet),
      });
    if (morphologie !== undefined) {
      ajouter(
        'mots',
        morphologie,
        morphologie.mots.map(({ id }) => id),
      );
    }
    if (schemas !== undefined) lignes.push(schemas);
    if (textes !== undefined) {
      ajouter(
        'textes',
        textes,
        textes.textes.map(({ id }) => id),
      );
    }
    if (exercices !== undefined) {
      ajouter(
        'exercices',
        exercices,
        exercices.familles.flatMap((famille) => famille.exercices.map(({ id }) => id)),
      );
    }
    // Toutes les feuilles sur une ligne (F1-D12), avec le score de leur onglet : la dernière
    // réponse de chaque élément fait foi (F1-D3, R15).
    if (feuilles.length > 0) {
      const scores = feuilles.map((feuille) => scoreDeFeuille(feuille, dernieres));
      lignes.push({
        onglet: 'feuilles',
        nom: t.onglet_feuilles,
        sousTitre:
          feuilles.length === 1
            ? t.apercu_feuille_une
            : formater(t.apercu_feuilles, { n: feuilles.length }),
        faits: scores.reduce((n, { justes }) => n + justes, 0),
        total: scores.reduce((n, { total }) => n + total, 0),
        ouvrir: () => aller('feuilles'),
      });
    }
    return lignes;
  };

  // Les divisions par manuel, ou `undefined` : l'écran d'aujourd'hui, « Kapitel » puis « Weitere
  // Übungen », sans étiquette de Unit (A2-D6, A2-D8). La dernière section est toujours celle des
  // exercices, vide ou non : la légende des boîtes vient juste avant elle (A2-D8).
  const divisions = divisionsDuCours(cours);
  const sections: Section[] =
    divisions === undefined
      ? [
          {
            id: 'apercu-chapitres',
            titre: t.apercu_chapitres,
            chapitres: cours.chapitres,
            exercices: [],
          },
          {
            id: 'apercu-weitere',
            titre: t.apercu_weitere,
            chapitres: [],
            exercices: lignesDExercices(
              cours.schemas.length > 0 ? ligneDeSchemas(cours.schemas) : undefined,
            ),
          },
        ]
      : divisions.map(({ manuel, chapitres, schemas }) => {
          const ligne = schemas.length > 0 ? ligneDeSchemas(schemas) : undefined;
          return manuel === undefined
            ? {
                id: 'apercu-uebungen',
                titre: t.division_uebungen,
                chapitres,
                exercices: lignesDExercices(ligne),
              }
            : {
                id: `apercu-manuel-${manuel.id}`,
                titre: manuel.titre,
                chapitres,
                exercices: ligne === undefined ? [] : [ligne],
              };
        });
  const derniere = sections.at(-1) as Section;
  // Les mots réussis font aussi l'un des quatre chiffres.
  const idsDesMots = morphologie?.mots.map(({ id }) => id) ?? [];

  return (
    <section>
      <div class="stats">
        <Chiffre valeur={tout.sures} sur={tout.total} libelle={t.apercu_sures} />
        <Chiffre valeur={dues} libelle={t.apercu_dues} />
        {morphologie !== undefined && (
          <Chiffre
            valeur={reussis(idsDesMots, etats)}
            sur={idsDesMots.length}
            libelle={t.apercu_mots}
          />
        )}
        {cours.examen !== undefined && (
          <Chiffre
            valeur={
              dernierExamen === undefined ? SANS_NOTE : dernierExamen.resultat.note.toFixed(1)
            }
            libelle={dernierExamen === undefined ? t.apercu_aucun_examen : t.apercu_derniere_note}
          />
        )}
      </div>

      <p class="muted">
        {cours.chapitres.length > 0 && (
          <>{enGras(t.apercu_deux_sens, { direct: t.sens_direct, inverse: t.sens_inverse })} </>
        )}
        {formater(t.apercu_serie, {
          serie: serie(parJour, aujourdhui),
          aujourdhui: parJour.get(aujourdhui) ?? 0,
        })}
      </p>

      {sections.slice(0, -1).map((section) => (
        <SectionDeLApercu key={section.id} section={section} avecUnit={divisions !== undefined} />
      ))}
      {cours.chapitres.length > 0 && <Legende />}
      <SectionDeLApercu section={derniere} avecUnit={divisions !== undefined} />
    </section>
  );
}
