/*
 * Les cours factices des tests de routes (1f-D4 : une seule copie), tous tirés du cours d'exemple :
 * l'un a des éléments « à vérifier », l'autre non, le troisième les garde avec une dérogation de
 * diffusion. Données factices écrites à la main (invariant 7). Exclu de la construction, comme tout
 * `*.fixture.ts`.
 */
import { analyserContenus } from '../domaine/contenu/analyse.js';
import { exempleDeCours } from '../domaine/contenu/exemple.fixture.js';
import type { Cours } from '../domaine/contenu/modele.js';

export const ID_A_VERIFIER = 'j5by5stz';
export const ID_SOURCE = 'q3m8vx2k';
export const ID_DEROGE = 'b7k2mx9p';
// Un identifiant bien formé qu'aucun cours ne porte.
export const ID_INEXISTANT = 'zzzzzzzz';

/** Le cours analysé ; ses fichiers doivent être valides. */
export function analyser(fichiers: Map<string, string>): Cours {
  const { cours, erreurs } = analyserContenus(fichiers);
  const [premier] = cours;
  if (erreurs.length > 0 || premier === undefined) {
    throw new Error(`cours factice invalide : ${JSON.stringify(erreurs)}`);
  }
  return premier;
}

/** Le cours d'exemple sous un autre identifiant et un autre titre, après `transformer`. */
function variante(
  id: string,
  titre: string,
  transformer: (chemin: string, texte: string) => string = (_chemin, texte) => texte,
): Cours {
  return analyser(
    new Map(
      [...exempleDeCours()].map(([chemin, texte]) => [
        chemin,
        transformer(
          chemin,
          texte.replaceAll(ID_A_VERIFIER, id).replace('titre: "Übungskurs"', `titre: "${titre}"`),
        ),
      ]),
    ),
  );
}

/** Le cours d'exemple, qui a des éléments « à vérifier » et pas de dérogation de diffusion. */
export const COURS_A_VERIFIER = analyser(exempleDeCours());
/**
 * Un élément du cours d'exemple que `COURS_SOURCE` fait passer à `vérifié`, avec son `verifie_le` :
 * `avant` est le texte à remplacer, une seule fois, dans le fichier `chemin` (un fichier peut avoir
 * plusieurs entrées) ; s'il manque, la fixture lève.
 */
const RELUS: readonly { chemin: string; avant: string; apres: string }[] = [
  {
    chemin: 'essai/schemas/muster.yaml',
    avant: 'statut: "source"\n',
    apres: 'statut: "vérifié"\nverifie_le: "2026-10-02"\n',
  },
  {
    chemin: 'essai/morphologie.yaml',
    avant: '    sens: "erfunden"\n',
    apres: '    sens: "erfunden"\n    statut: "vérifié"\n    verifie_le: "2026-10-03"\n',
  },
  {
    chemin: 'essai/morphologie.yaml',
    avant: '    sens: "Entzündung der Vorlage"\n    statut: "source"\n',
    apres:
      '    sens: "Entzündung der Vorlage"\n    statut: "vérifié"\n    verifie_le: "2026-10-06"\n',
  },
  {
    chemin: 'essai/textes.yaml',
    avant: '    titre: "Bericht 1"\n',
    apres: '    titre: "Bericht 1"\n    statut: "vérifié"\n    verifie_le: "2026-10-04"\n',
  },
  {
    chemin: 'essai/exercices.yaml',
    avant: '        reponse: "der"\n',
    apres: '        reponse: "der"\n        statut: "vérifié"\n        verifie_le: "2026-10-05"\n',
  },
];
/**
 * Une variante où chaque élément « à vérifier » devient `source`, sauf `RELUS` qui passent à
 * `vérifié` : chaque clé facultative d'état est ainsi servie au moins une fois
 * (`cles_servies_de_chaque_type_de_module`).
 */
export const COURS_SOURCE = variante(ID_SOURCE, 'Quellenkurs', (chemin, texte) => {
  const propre = texte.replace(/^( *)statut: "à vérifier"$/gm, '$1statut: "source"');
  return RELUS.filter((relu) => relu.chemin === chemin).reduce((texteRelu, relu) => {
    if (!texteRelu.includes(relu.avant)) {
      throw new Error(`RELUS : « ${relu.avant} » introuvable dans ${relu.chemin}`);
    }
    return texteRelu.replace(relu.avant, () => relu.apres);
  }, propre);
});
/** Une variante « à vérifier » dont le manifeste autorise la diffusion à un groupe. */
export const COURS_DEROGE = variante(ID_DEROGE, 'Ausnahmekurs', (chemin, texte) =>
  chemin === 'essai/cours.yaml'
    ? texte.replace(
        'modules:\n',
        'derogation_diffusion:\n  motif: "Relecture en cours, diffusion acceptée par écrit"\n  date: "2026-10-16"\nmodules:\n',
      )
    : texte,
);
/** Ni dans l'ordre des identifiants, ni dans celui des titres : l'ordre des cours chargés. */
export const CATALOGUE = [COURS_A_VERIFIER, COURS_SOURCE, COURS_DEROGE];
