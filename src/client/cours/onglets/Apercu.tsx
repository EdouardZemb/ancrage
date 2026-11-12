/*
 * « Übersicht », l'aperçu du cours, repris du prototype (`renderHome`, H:1712-1739) : quatre
 * chiffres, la série, un chapitre par module de cartes avec sa barre et « Lernen », la légende des
 * boîtes, puis les autres exercices du cours avec leur sous-titre (décision 19), les feuilles
 * comprises (F1-D12).
 *
 * Un chiffre, une ligne ou une section n'apparaît que si le cours a le module qu'elle décrit : un
 * cours sans mots n'a pas de « Wörter zerlegt », un cours sans examen pas de note.
 */
import { useMemo } from 'preact/hooks';
import type { Onglet } from '../../../domaine/cours/prepare.js';
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

interface AutreExercice {
  onglet: Onglet;
  nom: string;
  sousTitre: string | undefined;
  faits: number;
  total: number;
}

export function Apercu() {
  const {
    cours,
    t,
    evenements,
    etats,
    aujourdhui,
    preferences,
    changerPreferences,
    aller,
    oublierEtatDOnglet,
  } = useCours();
  const parJour = useMemo(() => reponsesParJour(evenements), [evenements]);
  const dernierExamen = useMemo(() => examensPasses(evenements).at(-1), [evenements]);
  const dernieres = useMemo(() => dernieresReponses(evenements), [evenements]);

  const tout = statistiquesDeChapitre(cours.unites, etats, aujourdhui);
  // « À revoir aujourd'hui » est le compte de « Heute » : tout ce que la séance peut poser (M2-P5).
  const dues = useMemo(
    () => duesDuJour(posablesDuCours(cours), etats, aujourdhui).length,
    [cours, etats, aujourdhui],
  );
  const { morphologie, schemas, textes, exercices, feuilles } = cours;

  const lernen = (chapitre: string) => {
    changerPreferences({ ...preferences, cartes: { ...preferences.cartes, chapitre } });
    // Une série neuve, même sur le chapitre de la série en cours (H:1738).
    oublierEtatDOnglet('cartes');
    aller('cartes');
  };

  const autres: AutreExercice[] = [];
  if (morphologie !== undefined) {
    const mots = morphologie.mots.map(({ id }) => id);
    autres.push({
      onglet: 'mots',
      nom: morphologie.titre,
      sousTitre: morphologie.description,
      faits: reussis(mots, etats),
      total: mots.length,
    });
  }
  if (schemas.length > 0) {
    const points = schemas.flatMap((schema) => schema.points.map(({ id }) => id));
    autres.push({
      onglet: 'schemas',
      nom: t.onglet_schemas,
      sousTitre: schemas.map(({ titre }) => titre).join(' · '),
      faits: reussis(points, etats),
      total: points.length,
    });
  }
  if (textes !== undefined) {
    const ids = textes.textes.map(({ id }) => id);
    autres.push({
      onglet: 'textes',
      nom: textes.titre,
      sousTitre: textes.description,
      faits: reussis(ids, etats),
      total: ids.length,
    });
  }
  if (exercices !== undefined) {
    const ids = exercices.familles.flatMap((famille) => famille.exercices.map(({ id }) => id));
    autres.push({
      onglet: 'exercices',
      nom: exercices.titre,
      sousTitre: exercices.description,
      faits: reussis(ids, etats),
      total: ids.length,
    });
  }
  // Toutes les feuilles sur une ligne (F1-D12), avec le score de leur onglet : la dernière réponse
  // de chaque élément fait foi (F1-D3, R15).
  if (feuilles.length > 0) {
    const scores = feuilles.map((feuille) => scoreDeFeuille(feuille, dernieres));
    autres.push({
      onglet: 'feuilles',
      nom: t.onglet_feuilles,
      sousTitre:
        feuilles.length === 1
          ? t.apercu_feuille_une
          : formater(t.apercu_feuilles, { n: feuilles.length }),
      faits: scores.reduce((n, { justes }) => n + justes, 0),
      total: scores.reduce((n, { total }) => n + total, 0),
    });
  }
  // Les mots réussis font aussi l'un des quatre chiffres.
  const mots = autres.find(({ onglet }) => onglet === 'mots');

  return (
    <section>
      <div class="stats">
        <Chiffre valeur={tout.sures} sur={tout.total} libelle={t.apercu_sures} />
        <Chiffre valeur={dues} libelle={t.apercu_dues} />
        {mots !== undefined && (
          <Chiffre valeur={mots.faits} sur={mots.total} libelle={t.apercu_mots} />
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

      {cours.chapitres.length > 0 && (
        <>
          <h2 id="apercu-chapitres">{t.apercu_chapitres}</h2>
          <ul class="chapters" aria-labelledby="apercu-chapitres">
            {cours.chapitres.map((chapitre) => {
              const st = statistiquesDeChapitre(
                unitesDuChoix(cours, chapitre.id, 'mix'),
                etats,
                aujourdhui,
              );
              return (
                <li key={chapitre.id} class="chap">
                  <span class="num">{chapitre.numero}</span>
                  <span class="title">
                    {chapitre.titre}
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
                  <button type="button" class="small-btn" onClick={() => lernen(chapitre.id)}>
                    {t.apercu_lernen}
                  </button>
                  <Barre boites={st.boites} total={st.total} />
                </li>
              );
            })}
          </ul>
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
        </>
      )}

      {autres.length > 0 && (
        <>
          <h2 id="apercu-weitere">{t.apercu_weitere}</h2>
          <ul class="chapters" aria-labelledby="apercu-weitere">
            {autres.map((autre) => (
              <li key={autre.onglet} class="chap">
                <span class="num" aria-hidden="true">
                  ·
                </span>
                <span class="title">
                  {autre.nom}
                  <br />
                  <span class="meta">
                    {[autre.sousTitre, `${autre.faits}/${autre.total}`]
                      .filter((morceau) => morceau !== undefined && morceau !== '')
                      .join(' · ')}
                  </span>
                </span>
                <button type="button" class="small-btn" onClick={() => aller(autre.onglet)}>
                  {t.apercu_ueben}
                </button>
                <Avancement faits={autre.faits} total={autre.total} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
