/*
 * « Schemata » (`renderAnat`, H:2072-2110, et les touches de H:2248-2249) : les points d'un schéma
 * à nommer (« Benennen », quatre noms au choix), à toucher (« Zeigen ») ou à étudier (« Lernansicht »,
 * sans question ni journal).
 *
 * Chaque réponse est journalisée sur le point demandé. La série (le score) et la question en cours
 * vivent dans l'écran du cours (`useEtatDOnglet`) : un détour par un autre onglet les retrouve. Elle
 * recommence au changement de schéma ou d'exercice. Un schéma sans point n'a rien à demander :
 * l'onglet le dit, et ne plante pas.
 */
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { reussis } from '../../../domaine/progression/statistiques.js';
import { tacheDeSchema } from '../../../domaine/seances/schemas.js';
import { useTouches } from '../clavier.js';
import { enGras, focaliser, Options } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { DessinSchema } from '../DessinSchema.js';
import type { Preferences } from '../preferences.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** Les touches 1 à 4 choisissent le premier à le quatrième nom (H:2248). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

type Mode = Preferences['schemas']['mode'];

/** Un point à trouver : son indice, les indices des noms proposés, et celui choisi. */
interface Tache {
  cible: number;
  options: number[];
  choisi: number | null;
}

/** `tache` est `null` en « Lernansicht », ou quand le schéma n'a aucun point. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  tache: Tache | null;
}

export function Schemas() {
  const { cours, preferences } = useCours();
  // Un schéma que le cours n'a plus (une préférence ancienne) laisse le premier.
  const schema =
    cours.schemas.find(({ id }) => id === preferences.schemas.schema) ?? cours.schemas[0];
  return schema === undefined ? null : <SchemaChoisi schema={schema} />;
}

function SchemaChoisi(props: { schema: ModuleServiDe<'schema'> }) {
  const { schema } = props;
  const { cours, t, etats, enregistrer, preferences, changerPreferences, hasard, useEtatDOnglet } =
    useCours();
  const { mode } = preferences.schemas;
  const { points } = schema;
  const cle = `${schema.id}|${mode}`;

  const tirer = (): Tache | null =>
    mode === 'lernen' || points.length === 0
      ? null
      : { ...tacheDeSchema(schema, etats, hasard), choisi: null };
  const demarrer = (): Serie => ({ cle, faites: 0, justes: 0, tache: tirer() });
  const [courante, setCourante] = useEtatDOnglet<Serie>('schemas', demarrer, serieCommencee);
  // Un autre schéma ou un autre exercice : on recommence.
  let serie = courante;
  if (courante.cle !== cle) serie = demarrer();
  if (serie !== courante) setCourante(serie);

  const { tache } = serie;
  const attendue = tache !== null && tache.choisi === null;

  const choisir = (suite: Partial<Preferences['schemas']>) =>
    changerPreferences({ ...preferences, schemas: { ...preferences.schemas, ...suite } });

  const repondre = (j: number) => {
    if (tache === null || tache.choisi !== null) return;
    const juste = j === tache.cible;
    setCourante({
      ...serie,
      faites: serie.faites + 1,
      justes: serie.justes + (juste ? 1 : 0),
      tache: { ...tache, choisi: j },
    });
    void enregistrer(points[tache.cible].id, juste);
  };

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [
      numero,
      () => {
        const j = tache?.options[i];
        if (j !== undefined) repondre(j);
      },
    ]),
  );
  useTouches(touches, mode === 'benennen' && attendue);

  const acquis = formater(t.schemas_gekonnt, {
    n: reussis(
      points.map(({ id }) => id),
      etats,
    ),
    total: points.length,
  });

  return (
    <section>
      <div class="controls">
        <select
          aria-label={t.schemas_choix}
          value={schema.id}
          onChange={(e) => choisir({ schema: e.currentTarget.value })}
        >
          {cours.schemas.map((chacun) => (
            <option key={chacun.id} value={chacun.id}>
              {chacun.titre}
            </option>
          ))}
        </select>
        <select
          aria-label={t.choix_exercice}
          value={mode}
          onChange={(e) => choisir({ mode: e.currentTarget.value as Mode })}
        >
          <option value="benennen">{t.schemas_benennen}</option>
          <option value="zeigen">{t.schemas_zeigen}</option>
          <option value="lernen">{t.schemas_lernansicht}</option>
        </select>
        <span class="progressline">
          {mode !== 'lernen' &&
            `${formater(t.serie_resultat, { justes: serie.justes, faites: serie.faites })} · `}
          {acquis}
        </span>
      </div>
      <p class="muted" style={{ fontSize: '.88rem' }}>
        {schema.note}
      </p>

      {mode === 'lernen' ? (
        <div class="study">
          <DessinSchema schema={schema} />
          <ol>
            {points.map((point) => (
              <li key={point.id}>
                <b>{point.terme}</b> – {point.sens}
              </li>
            ))}
          </ol>
        </div>
      ) : tache === null ? (
        <p class="muted">{t.onglet_vide}</p>
      ) : (
        <Question
          schema={schema}
          mode={mode}
          tache={tache}
          repondre={repondre}
          suivante={() => setCourante({ ...serie, tache: tirer() })}
        />
      )}
    </section>
  );
}

/** La question en cours : le dessin et, selon l'exercice, quatre noms ou un point à toucher. */
function Question(props: {
  schema: ModuleServiDe<'schema'>;
  mode: Exclude<Mode, 'lernen'>;
  tache: Tache;
  repondre(j: number): void;
  suivante(): void;
}) {
  const { schema, mode, tache, repondre, suivante } = props;
  const { t } = useCours();
  const point = schema.points[tache.cible];
  const repondue = tache.choisi !== null;
  const juste = tache.choisi === tache.cible;
  // Le bon point en vert ; en « Zeigen », le point touché à tort en rouge.
  const marques: Record<number, 'ok' | 'ko'> = {};
  if (repondue) {
    marques[tache.cible] = 'ok';
    if (!juste && mode === 'zeigen' && tache.choisi !== null) marques[tache.choisi] = 'ko';
  }

  const verdict = repondue && (
    <>
      <div class={`verdict ${juste ? 'ok' : 'ko'}`} style={{ justifySelf: 'center' }}>
        <span>{juste ? t.verdict_juste : t.verdict_fausse}</span>
        <b>
          {tache.cible + 1} = {point.terme}
        </b>
        <span class="muted">{point.sens}</span>
      </div>
      <button type="button" class="primary" ref={focaliser} onClick={suivante}>
        {t.suivante}
      </button>
    </>
  );

  if (mode === 'benennen') {
    return (
      <>
        <div class="card">
          <DessinSchema
            schema={schema}
            cible={repondue ? undefined : tache.cible}
            marques={marques}
          />
          <p>
            {enGras(t.schemas_wie_heisst, {
              nummer: formater(t.schemas_nummer, { n: tache.cible + 1 }),
            })}
          </p>
        </div>
        {repondue ? (
          verdict
        ) : (
          <Options
            options={tache.options.map((j) => schema.points[j].terme)}
            choisir={(k) => repondre(tache.options[k])}
          />
        )}
      </>
    );
  }
  return (
    <>
      <div class="card">
        <p>
          {enGras(t.schemas_tippe_auf, { terme: point.terme })}{' '}
          <span class="muted">({point.sens})</span>
        </p>
        <DessinSchema schema={schema} marques={marques} cliquable={!repondue} choisir={repondre} />
      </div>
      {verdict}
    </>
  );
}
