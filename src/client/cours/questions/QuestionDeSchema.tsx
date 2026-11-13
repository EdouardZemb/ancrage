/*
 * L'écran d'une question de schéma (`renderAnat`, H:2072-2110, touches H:2248-2249) : le dessin et,
 * selon l'exercice, quatre noms à choisir (« Benennen ») ou un point à toucher (« Zeigen »). L'onglet
 * « Schemata » et la séance « Heute » la posent de la même façon : le composant ne connaît ni la
 * série ni le tirage de l'appelant.
 */
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import { useTouches } from '../clavier.js';
import { enGras, focaliser, Options } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { DessinSchema } from '../DessinSchema.js';
import { formater } from '../textes-cours.js';

/** Les touches 1 à 4 choisissent le premier à le quatrième nom (H:2248). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

/** Un point à trouver : son indice, les indices des noms proposés, et celui choisi. */
export interface TacheDeSchema {
  cible: number;
  options: number[];
  choisi: number | null;
}

/** La question en cours : le dessin et, selon l'exercice, quatre noms ou un point à toucher. */
export function QuestionDeSchema(props: {
  schema: ModuleServiDe<'schema'>;
  mode: 'benennen' | 'zeigen';
  tache: TacheDeSchema;
  /** Le point choisi, et le geste : `choix` (un nom parmi quatre) ou `pointage` (un point touché). */
  repondre(j: number, mode: ModeDeReponse): void;
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

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [
      numero,
      () => {
        const j = tache.options[i];
        if (j !== undefined) repondre(j, 'choix');
      },
    ]),
  );
  useTouches(touches, mode === 'benennen' && !repondue);

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
            choisir={(k) => repondre(tache.options[k], 'choix')}
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
        <DessinSchema
          schema={schema}
          marques={marques}
          cliquable={!repondue}
          choisir={(j) => repondre(j, 'pointage')}
        />
      </div>
      {verdict}
    </>
  );
}
