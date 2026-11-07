/*
 * Les réglages de « Prüfung », avant de commencer l'examen : chapitres, taille, chrono et modules
 * (ils quittent `Examen.tsx`, 2b-D6).
 */
import { useState } from 'preact/hooks';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { composerExamen, examenAvecModulesPossible } from '../../../domaine/seances/examen.js';
import { useCours } from '../contexte-cours.js';
import { formater } from '../textes-cours.js';
import type { Passage } from './examen-libelles.js';

export const MS_PAR_MINUTE = 60_000;

/** Les réglages d'un examen, avant de le commencer (H:2005-2028). */
export function Reglages(props: {
  module: ModuleServiDe<'examen'>;
  commencer(passage: Passage): void;
}) {
  const { module } = props;
  const { cours, t, etats, preferences, changerPreferences, hasard } = useCours();
  const { chapitres, taille, chrono, avecModules } = preferences.examen;
  // Sans schéma, texte annoté, exercices ni élément de feuille à poser, la case ne mêle rien à
  // l'examen : les mots de la morphologie viennent avec leurs chapitres.
  const aDesModules = examenAvecModulesPossible(cours);
  const [sansQuestion, setSansQuestion] = useState(false);

  const choisir = (suite: Partial<typeof preferences.examen>) => {
    setSansQuestion(false);
    changerPreferences({ ...preferences, examen: { ...preferences.examen, ...suite } });
  };
  const tousLesChapitres = cours.chapitres.map(({ id }) => id);

  const demarrer = () => {
    if (chapitres.length === 0) return;
    const examen = composerExamen(
      cours,
      etats,
      { chapitres, taille, avecModules: avecModules && aDesModules, chrono },
      hasard,
    );
    // Le prototype plantait sur un choix sans question (`qs[0]`) : on ne commence pas.
    if (examen.questions.length === 0) {
      setSansQuestion(true);
      return;
    }
    const debut = Date.now();
    props.commencer({
      examen,
      reponses: [],
      indice: 0,
      debut,
      echeance: chrono ? debut + examen.minutes * MS_PAR_MINUTE : null,
      confirmer: false,
      resultat: null,
    });
  };

  return (
    <section>
      <h2>{t.examen_titre}</h2>
      <p class="muted">{formater(t.examen_anleitung, { note: module.noteSuffisante })}</p>
      <div class="checks">
        {cours.chapitres.map((chapitre) => (
          <label key={chapitre.id} class="inline">
            <input
              type="checkbox"
              checked={chapitres.includes(chapitre.id)}
              onChange={(e) =>
                choisir({
                  chapitres: tousLesChapitres.filter((id) =>
                    id === chapitre.id ? e.currentTarget.checked : chapitres.includes(id),
                  ),
                })
              }
            />{' '}
            {chapitre.numero} · {chapitre.titre}
          </label>
        ))}
      </div>
      <div class="controls">
        <label class="inline">
          {t.examen_fragen}{' '}
          <select
            value={String(taille)}
            onChange={(e) => choisir({ taille: Number(e.currentTarget.value) })}
          >
            {module.tailles.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label class="inline">
          <input
            type="checkbox"
            checked={chrono}
            onChange={(e) => choisir({ chrono: e.currentTarget.checked })}
          />{' '}
          {formater(t.examen_chrono, { secondes: module.secondesParQuestion })}
        </label>
        {aDesModules && (
          <label class="inline">
            <input
              type="checkbox"
              checked={avecModules}
              onChange={(e) => choisir({ avecModules: e.currentTarget.checked })}
            />{' '}
            {t.examen_avec_modules}
          </label>
        )}
        <button
          type="button"
          class="ghost"
          onClick={() => choisir({ chapitres: tousLesChapitres })}
        >
          {t.examen_alle}
        </button>
        <button type="button" class="ghost" onClick={() => choisir({ chapitres: [] })}>
          {t.examen_keine}
        </button>
      </div>
      <div>
        <button type="button" class="primary" disabled={chapitres.length === 0} onClick={demarrer}>
          {t.examen_starten}
        </button>
      </div>
      {sansQuestion && <p class="muted">{t.onglet_vide}</p>}
    </section>
  );
}
