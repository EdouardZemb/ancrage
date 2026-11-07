/*
 * Le dessin d'un schéma (`anatSvg`, H:1648-1651) : l'intérieur du SVG que l'API sert, inséré tel
 * quel, puis un repère numéroté à la place de chaque point (`x`, `y`). La couleur d'un repère dit
 * où en est la question : en cours (`cible`), juste ou fausse (`marques`, par indice de point).
 *
 * Quand le dessin est `cliquable` (« Zeigen »), chaque repère est un bouton : on le touche, ou on
 * le focalise et l'on presse Entrée ou Espace. L'image est alors un groupe nommé et non une image,
 * qui rendrait ses enfants présentationnels pour la technologie d'assistance.
 *
 * C'est le seul HTML brut que le client insère. Le dessin vient du contenu : à son chargement,
 * le serveur refuse tout ce qui pourrait y exécuter du code ou charger une ressource hors du dessin
 * (R37). La règle, ce qui est admis et ce qui est refusé, est `defautsDuDessin`
 * (`src/domaine/contenu/dessin.ts`). Et la politique de sécurité du contenu du serveur interdit de
 * toute façon tout script en ligne. Comme tout le contenu d'un cours, le dessin ne sort que par
 * l'API, après contrôle des droits (invariant 3).
 */
import type { ModuleServiDe } from '../../domaine/cours/prepare.js';
import { useCours } from './contexte-cours.js';
import { formater } from './textes-cours.js';

export function DessinSchema(props: {
  schema: ModuleServiDe<'schema'>;
  /** L'indice du point en cours, mis en avant. */
  cible?: number;
  /** Les points déjà jugés, par indice. */
  marques?: Record<number, 'ok' | 'ko'>;
  cliquable?: boolean;
  /** Appelée avec l'indice du point touché, si le dessin est `cliquable`. */
  choisir?: (i: number) => void;
}) {
  const { t } = useCours();
  const { schema, cible, marques, cliquable = false, choisir } = props;

  return (
    <svg
      class={cliquable ? 'sv clickable' : 'sv'}
      viewBox={schema.viewbox}
      role={cliquable ? 'group' : 'img'}
      aria-label={schema.titre}
    >
      <g dangerouslySetInnerHTML={{ __html: schema.dessin }} />
      {schema.points.map((point, i) => {
        const classe = ['mk', i === cible ? 'cur' : '', marques?.[i] ?? '']
          .filter(Boolean)
          .join(' ');
        const commun = {
          class: classe,
          transform: `translate(${point.x} ${point.y})`,
        };
        const contenu = (
          <>
            <circle r="10" />
            <text y="3.5">{i + 1}</text>
          </>
        );
        if (!cliquable) {
          return (
            <g key={point.id} {...commun}>
              {contenu}
            </g>
          );
        }
        return (
          // biome-ignore lint/a11y/useSemanticElements: un repère de SVG ne peut pas être un <button>.
          <g
            key={point.id}
            {...commun}
            role="button"
            tabindex={0}
            aria-label={formater(t.schemas_nummer, { n: i + 1 })}
            onClick={() => choisir?.(i)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              if (!e.repeat) choisir?.(i);
            }}
          >
            {contenu}
          </g>
        );
      })}
    </svg>
  );
}
