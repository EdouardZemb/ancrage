/*
 * La vue « Ergebnis » d'une fiche (F3, ancrage-donnees#175) : un écran de lecture seule qui montre, pour chaque
 * exercice, l'énoncé, la bonne réponse (« Lösung »), le verdict de la dernière réponse et le jour où
 * elle a été donnée, dans l'ordre du papier. Il se dérive du journal à chaque rendu : une réponse
 * donnée ailleurs (le Quiz, la Prüfung) y paraît aussitôt. Il n'écrit rien (ADR-0004, ADR-0007).
 * Le verdict se dit en texte ; la couleur de la pastille ne fait que le doubler.
 */
import { useMemo } from 'preact/hooks';
import type { Tache } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import {
  dernieresReponsesDatees,
  resultatsDeFeuille,
} from '../../../domaine/feuilles/deroulement.js';
import { jourDe } from '../../../domaine/journal/temps.js';
import { focaliser } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { type CleTexteCours, formater } from '../textes-cours.js';

interface Ligne {
  id: string;
  enonce: string;
  loesung: string;
  /** L'explication qui suit une bonne réponse « Falsch », s'il y en a une. */
  korrektur?: string;
}

/** Les lignes d'une tâche, dans l'ordre du papier : l'énoncé et la bonne réponse de chaque élément. */
function lignesDeTache(tache: Tache, t: Record<CleTexteCours, string>): Ligne[] {
  switch (tache.genre) {
    case 'appariement':
      return tache.paires.map((p) => ({ id: p.id, enonce: p.terme, loesung: p.cible }));
    case 'classement':
      return tache.elements.map((e) => ({ id: e.id, enonce: e.terme, loesung: e.categorie }));
    case 'qcm':
      return tache.questions.map((q) => ({ id: q.id, enonce: q.question, loesung: q.reponse }));
    case 'vrai-faux':
      return tache.affirmations.map((a) => ({
        id: a.id,
        enonce: a.affirmation,
        loesung: a.vrai ? t.feuille_richtig : t.feuille_falsch,
        korrektur: a.correction,
      }));
    case 'trous':
      return tache.phrases.map((p) => ({
        id: p.id,
        enonce: p.texte,
        loesung: p.reponses.join(' · '),
      }));
    case 'orthographe':
      return tache.mots.map((m) => ({ id: m.id, enonce: m.fautif, loesung: m.reponse }));
    case 'ouverte':
      return tache.questions.map((q) => ({ id: q.id, enonce: q.question, loesung: q.reponse }));
    default: {
      const _exhaustif: never = tache;
      return [];
    }
  }
}

export function ErgebnisDeFeuille(props: { feuille: ModuleServiDe<'feuille'>; retour(): void }) {
  const { feuille, retour } = props;
  const { evenements, t } = useCours();
  const resultats = useMemo(
    () => resultatsDeFeuille(feuille, dernieresReponsesDatees(evenements)),
    [feuille, evenements],
  );
  const elements = resultats.flatMap((resultat) => resultat.elements);
  const justes = elements.filter(({ derniere }) => derniere?.juste === true).length;

  return (
    <section class="ergebnis">
      <div class="controls">
        <button type="button" class="ghost" ref={focaliser} onClick={retour}>
          {t.feuilles_zurueck}
        </button>
      </div>
      <h2>{feuille.titre}</h2>
      <p class="meta">{formater(t.feuilles_score, { justes, total: elements.length })}</p>
      <p class="meta">{t.feuilles_ergebnis_hinweis}</p>
      {resultats.map(({ partie, tache, elements: dernieres }) => {
        const idConsigne = `ergebnis-${tache.id}`;
        const derniere = new Map(dernieres.map((e) => [e.id, e.derniere]));
        return (
          <div key={tache.id} class="tache">
            <span class="kind">{partie}</span>
            <p class="consigne" id={idConsigne}>
              {tache.consigne}
            </p>
            {tache.genre === 'ouverte' && <p class="meta">{t.feuilles_ergebnis_selbst}</p>}
            <ul class="resultats" aria-labelledby={idConsigne}>
              {lignesDeTache(tache, t).map((ligne) => {
                const reponse = derniere.get(ligne.id) ?? null;
                const datum = reponse === null ? '' : jourDe(reponse.reponduA);
                return (
                  <li key={ligne.id} class="element">
                    <p class="enonce">{ligne.enonce}</p>
                    <p class="loesung">
                      {formater(t.feuilles_ergebnis_loesung, { loesung: ligne.loesung })}
                    </p>
                    {ligne.korrektur !== undefined && <p class="correction">{ligne.korrektur}</p>}
                    {reponse === null ? (
                      <span class="pill offen">{t.feuilles_ergebnis_offen}</span>
                    ) : reponse.juste ? (
                      <span class="pill ok">
                        {formater(t.feuilles_ergebnis_richtig, { datum })}
                      </span>
                    ) : (
                      <span class="pill ko">{formater(t.feuilles_ergebnis_falsch, { datum })}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <div class="controls">
        <button type="button" class="ghost" onClick={retour}>
          {t.feuilles_zurueck}
        </button>
      </div>
    </section>
  );
}
