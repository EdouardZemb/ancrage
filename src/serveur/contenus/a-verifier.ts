import type { Cours, Etat, Module, Tache } from '../../domaine/contenu/modele.js';

/*
 * La liste imprimable des éléments « à vérifier » d'un cours, pour la relecture d'une enseignante
 * germanophone sur papier (issue ancrage-donnees#8). Deux fonctions pures : la liste, tirée du modèle résolu, puis
 * la page HTML, en allemand. Le PDF se fait ailleurs (`pdf.ts`).
 */

export interface ChampAVerifier {
  libelle: string;
  /** Une liste s'imprime en une ligne par valeur. */
  valeur: string | string[];
}

export interface ElementAVerifier {
  id: string;
  /** La nature de l'élément, en allemand. */
  nature: string;
  champs: ChampAVerifier[];
}

export interface ModuleAVerifier {
  titre: string;
  fichier: string;
  type: Module['type'];
  elements: ElementAVerifier[];
}

const A_VERIFIER = 'à vérifier';

function champ(libelle: string, valeur: string | string[]): ChampAVerifier {
  return { libelle, valeur };
}

function aVerifier(element: Etat): boolean {
  return element.statut === A_VERIFIER;
}

function elementsDeFeuille(tache: Tache): ElementAVerifier[] {
  const consigne = champ('Aufgabe', tache.consigne);
  const faire = (id: string, nature: string, champs: ChampAVerifier[]): ElementAVerifier => ({
    id,
    nature,
    champs: [consigne, ...champs],
  });
  switch (tache.genre) {
    case 'appariement':
      return tache.paires
        .filter(aVerifier)
        .map((p) => faire(p.id, 'Zuordnung', [champ('Begriff', p.terme), champ('Ziel', p.cible)]));
    case 'classement':
      return tache.elements
        .filter(aVerifier)
        .map((e) =>
          faire(e.id, 'Einordnung', [champ('Begriff', e.terme), champ('Kategorie', e.categorie)]),
        );
    case 'qcm':
      return tache.questions
        .filter(aVerifier)
        .map((q) =>
          faire(q.id, 'Multiple Choice', [
            champ('Frage', q.question),
            champ('Antwort', q.reponse),
            champ('Falsche Antworten', q.distracteurs),
          ]),
        );
    case 'vrai-faux':
      return tache.affirmations
        .filter(aVerifier)
        .map((a) =>
          faire(a.id, 'Richtig oder falsch', [
            champ('Aussage', a.affirmation),
            champ('Lösung', a.vrai ? 'richtig' : 'falsch'),
            ...(a.correction === undefined ? [] : [champ('Korrektur', a.correction)]),
          ]),
        );
    case 'trous':
      return tache.phrases
        .filter(aVerifier)
        .map((p) =>
          faire(p.id, 'Lückentext', [champ('Text', p.texte), champ('Antworten', p.reponses)]),
        );
    case 'orthographe':
      return tache.mots
        .filter(aVerifier)
        .map((m) =>
          faire(m.id, 'Rechtschreibung', [champ('Falsch', m.fautif), champ('Richtig', m.reponse)]),
        );
    case 'ouverte':
      return tache.questions
        .filter(aVerifier)
        .map((q) =>
          faire(q.id, 'Offene Frage', [champ('Frage', q.question), champ('Antwort', q.reponse)]),
        );
    default: {
      // Un nouveau genre de tâche doit dire ici comment s'imprime : `pnpm types` échoue sinon.
      const _exhaustif: never = tache;
      throw new Error('genre de tâche non géré');
    }
  }
}

/** Les éléments « à vérifier » d'un module, dans l'ordre du fichier. */
function elementsAVerifier(module: Module): ElementAVerifier[] {
  switch (module.type) {
    case 'cartes':
      return module.cartes.filter(aVerifier).map((c) => ({
        id: c.id,
        nature: 'Karte',
        champs: [
          champ('Vorderseite', c.recto),
          champ('Rückseite', c.verso),
          ...(c.reponses === undefined ? [] : [champ('Antworten', c.reponses)]),
        ],
      }));
    case 'morphologie':
      return [
        ...module.morphemes.filter(aVerifier).map((m) => ({
          id: m.id,
          nature: 'Wortbaustein',
          champs: [champ('Form', m.forme), champ('Bedeutung', m.sens)],
        })),
        ...module.mots.filter(aVerifier).map((m) => ({
          id: m.id,
          nature: 'Wort',
          champs: [champ('Wort', m.mot), champ('Bedeutung', m.sens)],
        })),
      ];
    case 'schema':
      return aVerifier(module)
        ? [
            {
              id: module.id,
              nature: 'Schema',
              champs: [
                champ('Titel', module.titre),
                champ('Zeichnung', 'siehe App'),
                champ('Hinweis', module.note),
                ...module.points.map((p) => champ(p.terme, p.sens)),
              ],
            },
          ]
        : [];
    case 'texte-annote':
      return module.textes.filter(aVerifier).map((t) => ({
        id: t.id,
        nature: 'Text',
        champs: [
          champ('Titel', t.titre),
          // Le texte lu, recomposé de ses segments : `texte` porte le balisage du fichier.
          champ('Text', t.segments.map((s) => ('jeton' in s ? s.jeton.forme : s.texte)).join('')),
          ...t.segments.flatMap((s) => ('jeton' in s ? [champ(s.jeton.forme, s.jeton.sens)] : [])),
          ...t.questions.flatMap((q) => [
            champ('Frage', q.question),
            champ('Antwort', q.reponse),
            champ('Falsche Antworten', q.distracteurs),
          ]),
        ],
      }));
    case 'exercices':
      return module.familles
        .flatMap((famille) => famille.exercices)
        .filter(aVerifier)
        .map((e) => ({
          id: e.id,
          nature: 'Übung',
          champs: [
            champ('Aufgabe', e.invite),
            champ('Antwort', e.reponse),
            ...(e.options === undefined ? [] : [champ('Optionen', e.options)]),
            ...(e.regle === undefined ? [] : [champ('Regel', e.regle)]),
          ],
        }));
    case 'feuille':
      return module.parties.flatMap((partie) => partie.taches.flatMap(elementsDeFeuille));
    case 'examen':
      // Des réglages, pas un contenu à relire : aucun statut, donc jamais dans la liste.
      return [];
    default: {
      // Un nouveau type de module doit dire ici comment s'imprime : `pnpm types` échoue sinon.
      const _exhaustif: never = module;
      throw new Error('type de module non géré');
    }
  }
}

/** Dans l'ordre des modules du cours, ceux qui ont au moins un élément « à vérifier ». */
export function listeAVerifier(cours: Cours): ModuleAVerifier[] {
  return cours.modules.flatMap((module) => {
    const elements = elementsAVerifier(module);
    return elements.length === 0
      ? []
      : [{ titre: module.titre, fichier: module.fichier, type: module.type, elements }];
  });
}

export function nombreDElements(liste: readonly ModuleAVerifier[]): number {
  return liste.reduce((somme, module) => somme + module.elements.length, 0);
}

const ECHAPPEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);
}

function htmlChamp({ libelle, valeur }: ChampAVerifier): string {
  const lignes = typeof valeur === 'string' ? [valeur] : valeur;
  const corps =
    lignes.length === 0
      ? '–'
      : lignes.map((ligne) => `<span class="ligne">${echapper(ligne)}</span>`).join('');
  return `<div class="champ"><dt>${echapper(libelle)}</dt><dd>${corps}</dd></div>`;
}

function htmlElement(element: ElementAVerifier, lignesDeKorrektur: number): string {
  const korrektur = Array.from(
    { length: lignesDeKorrektur },
    (_, i) => `<p class="korrektur">${i === 0 ? 'Korrektur:' : '&nbsp;'}</p>`,
  ).join('\n');
  return `<section class="element">
<p class="nature">${echapper(element.nature)} <span class="id">${echapper(element.id)}</span></p>
<dl>${element.champs.map(htmlChamp).join('')}</dl>
<p class="case">☐ korrekt</p>
${korrektur}
</section>`;
}

/** Une ligne par élément : gauche, droite (et « Auch richtig » s'il y a un troisième champ). */
function htmlLigne(element: ElementAVerifier): string {
  const [gauche, droite, autres] = element.champs;
  const aussi =
    autres === undefined
      ? ''
      : `<span class="aussi">Auch richtig:</span>${[autres.valeur]
          .flat()
          .map((v) => `<span class="ligne">${echapper(v)}</span>`)
          .join('')}`;
  return `<tr>
<td>${[gauche.valeur].flat().map(echapper).join('<br>')}<span class="id">${echapper(element.id)}</span></td>
<td>${[droite.valeur].flat().map(echapper).join('<br>')}${aussi}</td>
<td class="case">☐</td>
<td class="korrektur-cellule"></td>
</tr>`;
}

function htmlTableau(module: ModuleAVerifier, gauche: string, droite: string): string {
  return `<table>
<thead><tr><th>${echapper(gauche)}</th><th>${echapper(droite)}</th><th class="case">☐</th><th class="korrektur-cellule">Korrektur</th></tr></thead>
<tbody>
${module.elements.map(htmlLigne).join('\n')}
</tbody>
</table>`;
}

function htmlElements(module: ModuleAVerifier): string {
  const cadres = (lignes: number) =>
    module.elements.map((element) => htmlElement(element, lignes)).join('\n');
  switch (module.type) {
    case 'cartes':
      return htmlTableau(module, 'Vorderseite', 'Rückseite');
    case 'morphologie':
      return htmlTableau(module, 'Form / Wort', 'Bedeutung');
    case 'schema':
    case 'texte-annote':
      return cadres(2);
    case 'exercices':
    case 'feuille':
    case 'examen':
      return cadres(1);
    default: {
      // Un nouveau type de module doit dire ici comment s'imprime : `pnpm types` échoue sinon.
      const _exhaustif: never = module.type;
      throw new Error('type de module non géré');
    }
  }
}

function htmlModule(module: ModuleAVerifier): string {
  return `<article class="module">
<h2>${echapper(module.titre)}</h2>
<p class="fichier">${echapper(module.fichier)}</p>
${htmlElements(module)}
</article>`;
}

const STYLE = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; color: #000; background: #fff; margin: 0; padding: 12mm 16mm; }
h1 { font-size: 20pt; margin: 0 0 2mm; }
h2 { font-size: 14pt; margin: 8mm 0 1mm; border-bottom: 1.5px solid #000; padding-bottom: 1mm; break-after: avoid; }
.resume { margin: 0 0 4mm; color: #333; }
.consigne { margin: 0 0 4mm; font-weight: bold; }
.fichier { margin: 0 0 3mm; font-size: 9pt; color: #555; }
.element { border: 1px solid #888; border-radius: 2mm; padding: 2mm 3mm; margin: 0 0 3mm; break-inside: avoid; }
.nature { margin: 0 0 1mm; font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: .05em; color: #444; }
dl { margin: 0; }
.champ { display: flex; gap: 3mm; margin: 0 0 1mm; }
dt { flex: 0 0 32mm; font-weight: bold; }
dd { margin: 0; flex: 1; }
.ligne { display: block; }
.id { font-size: 7pt; color: #777; font-family: monospace; font-weight: normal; text-transform: none; letter-spacing: 0; }
.case { margin: 1mm 0; font-weight: bold; }
.korrektur { margin: 0; height: 7mm; border-bottom: 1px solid #999; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; table-layout: fixed; }
thead { display: table-header-group; }
th { text-align: left; font-size: 9pt; border-bottom: 1.5px solid #000; padding: 1mm 2mm; }
tr { break-inside: avoid; }
td { vertical-align: top; padding: 1.5mm 2mm; border-bottom: 1px solid #ccc; overflow-wrap: break-word; }
td .id { display: block; }
th:nth-child(1) { width: 27%; }
th:nth-child(2) { width: 31%; }
th.case, td.case { width: 6%; text-align: center; }
.korrektur-cellule { width: 36%; }
.aussi { display: block; margin-top: 1mm; font-size: 8pt; color: #555; }
@media print { body { padding: 0; } }
`;

/** La page autonome (aucune ressource externe), en allemand ; `date` s'imprime telle quelle. */
export function htmlAVerifier(liste: readonly ModuleAVerifier[], date: string): string {
  const nombre = nombreDElements(liste);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Zu prüfen</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Zu prüfen</h1>
<p class="resume">${echapper(date)} · ${nombre} ${nombre === 1 ? 'Element' : 'Elemente'}</p>
<p class="consigne">Bitte jedes Element prüfen: „korrekt“ ankreuzen oder die Korrektur eintragen.</p>
${liste.map(htmlModule).join('\n')}
</body>
</html>
`;
}
