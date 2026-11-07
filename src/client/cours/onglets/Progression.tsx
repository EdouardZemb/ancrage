/*
 * « Fortschritt », la progression du cours, reprise du prototype (`renderStats`, H:2200-2216) sans
 * son « Neu anfangen » : le journal ne fait que grandir (invariant 5, décision 2), et rien ici ne le
 * remet à zéro. Dans l'ordre : les réponses des 14 derniers jours, avec le total, la série et ce
 * que chaque module a de réussi ; les 10 derniers examens, du plus récent au plus ancien ; les 12
 * cartes les plus difficiles.
 *
 * Un module que le cours n'a pas n'a pas de total. Les examens ne sont filtrés par aucune unité :
 * ils comptent tous, même si le module qui les a posés n'est plus dans le cours.
 */
import { useMemo } from 'preact/hooks';
import { ajouterJours } from '../../../domaine/journal/temps.js';
import { examensPasses, reponsesParJour, serie } from '../../../domaine/progression/etat.js';
import { cartesDifficiles, reussis } from '../../../domaine/progression/statistiques.js';
import { useCours } from '../contexte-cours.js';
import { formater } from '../textes-cours.js';

const JOURS_AFFICHES = 14;
const EXAMENS_AFFICHES = 10;
const CARTES_AFFICHEES = 12;
/** Un jour avec des réponses reste lisible : sa barre fait au moins 6 % de la hauteur (H:2204). */
const HAUTEUR_MIN = 6;
/** Un jour sans réponse est un trait de 2 % (H:2204). */
const HAUTEUR_VIDE = 2;

/**
 * La couleur d'une note : verte à partir de la note suffisante (H:2210), rouge dessous. Sans module
 * d'examen dans le cours, le seuil est inconnu : la note n'est ni l'un ni l'autre.
 */
function couleurDeLaNote(note: number, suffisante: number | undefined): string {
  if (suffisante === undefined) return 'var(--muted)';
  return note >= suffisante ? 'var(--good)' : 'var(--bad)';
}

export function Progression() {
  const { cours, t, evenements, etats, aujourdhui } = useCours();
  const parJour = useMemo(() => reponsesParJour(evenements), [evenements]);
  const examens = useMemo(
    () => examensPasses(evenements).slice(-EXAMENS_AFFICHES).reverse(),
    [evenements],
  );

  const jours = Array.from({ length: JOURS_AFFICHES }, (_, i) =>
    ajouterJours(aujourdhui, i + 1 - JOURS_AFFICHES),
  );
  const maximum = Math.max(1, ...jours.map((jour) => parJour.get(jour) ?? 0));
  const reponses = [...parJour.values()].reduce((somme, n) => somme + n, 0);

  // Le total de chaque module que le cours a, dans l'ordre du prototype (H:2209).
  const { morphologie, schemas, textes, exercices, examen } = cours;
  const totaux = [
    formater(t.progression_antworten, { n: reponses }),
    formater(t.progression_serie, { n: serie(parJour, aujourdhui) }),
  ];
  const modules: [ids: string[] | undefined, libelle: string][] = [
    [morphologie?.mots.map(({ id }) => id), t.progression_mots],
    [
      schemas.length > 0
        ? schemas.flatMap((schema) => schema.points.map(({ id }) => id))
        : undefined,
      t.progression_schemas,
    ],
    [textes?.textes.map(({ id }) => id), t.progression_textes],
    [
      exercices?.familles.flatMap((famille) => famille.exercices.map(({ id }) => id)),
      t.progression_exercices,
    ],
  ];
  for (const [ids, libelle] of modules) {
    if (ids !== undefined) {
      // Seule la phrase des mots cite le titre de son module (celui du contenu).
      const valeurs = {
        module: morphologie?.titre ?? '',
        n: reussis(ids, etats),
        total: ids.length,
      };
      totaux.push(formater(libelle, valeurs));
    }
  }

  const difficiles = cartesDifficiles(cours.unites, etats, CARTES_AFFICHEES);

  return (
    <section>
      <h2>{t.progression_jours}</h2>
      <div>
        <div class="days">
          {jours.map((jour) => {
            const n = parJour.get(jour) ?? 0;
            const titre = formater(t.progression_jour, { jour, n });
            return (
              <div
                key={jour}
                role="img"
                aria-label={titre}
                title={titre}
                class={n > 0 ? '' : 'zero'}
                style={{
                  height: `${n > 0 ? Math.max(HAUTEUR_MIN, (n / maximum) * 100) : HAUTEUR_VIDE}%`,
                }}
              />
            );
          })}
        </div>
        <div class="dayl" aria-hidden="true">
          {jours.map((jour) => (
            <span key={jour}>{Number(jour.slice(8))}</span>
          ))}
        </div>
      </div>
      <p class="muted">{totaux.join(' · ')}</p>

      {(examen !== undefined || examens.length > 0) && (
        <>
          <h2>{t.progression_examens}</h2>
          {examens.length > 0 ? (
            <div class="table">
              {examens.map(({ jour, resultat }, i) => (
                <div key={`${i}|${jour}`}>
                  <b>{jour}</b>
                  <span>
                    {formater(t.progression_examen, {
                      points: resultat.points,
                      questions: resultat.questions,
                      chapitres: resultat.chapitres,
                      minutes: resultat.minutes,
                    })}
                  </span>
                  <em style={{ color: couleurDeLaNote(resultat.note, examen?.noteSuffisante) }}>
                    {formater(t.progression_note, { note: resultat.note.toFixed(1) })}
                  </em>
                </div>
              ))}
            </div>
          ) : (
            <p class="muted">
              {formater(t.progression_aucun_examen, { onglet: examen?.titre ?? '' })}
            </p>
          )}
        </>
      )}

      <h2>{t.progression_difficiles}</h2>
      {difficiles.length > 0 ? (
        <div class="table">
          {difficiles.map(({ unite, etat }) => (
            <div key={unite.id}>
              <b>{unite.question}</b>
              <span>{unite.reponse}</span>
              <em>{formater(t.progression_fausses, { n: etat.fausses })}</em>
            </div>
          ))}
        </div>
      ) : (
        <p class="muted">{t.progression_aucune_faute}</p>
      )}
    </section>
  );
}
