import type { ValeursDeNotice } from '../notice.js';
import { analyserContenus } from './analyse.js';
import { FICHIER_NOTICE } from './notice.js';
import { FICHIER_VERROU } from './verrou.js';

/**
 * Un petit cours `essai`, valide et entièrement factice, au format 1, avec la notice d'une instance
 * inventée. Les tests le modifient pour exercer chaque règle. Les clés sont relatives au dossier
 * de contenu, comme celles d'`analyserContenus`.
 */
export function exempleDeCours(): Map<string, string> {
  return new Map([
    [FICHIER_VERROU, CONTENU_DU_VERROU],
    [FICHIER_NOTICE, NOTICE],
    ['essai/cours.yaml', COURS],
    ['essai/cartes/01-grundbegriffe.yaml', CARTES_GRUNDBEGRIFFE],
    ['essai/cartes/02-vorsilben.yaml', CARTES_VORSILBEN],
    ['essai/morphologie.yaml', MORPHOLOGIE],
    ['essai/schemas/muster.yaml', SCHEMA_MUSTER],
    ['essai/schemas/muster.svg', DESSIN_MUSTER],
    ['essai/textes.yaml', TEXTES],
    ['essai/exercices.yaml', EXERCICES],
    ['essai/feuille.yaml', FEUILLE],
    ['essai/examen.yaml', EXAMEN],
  ]);
}

/** Les valeurs de la notice de l'exemple, telles que l'analyse les rend (S1-D7). */
export function valeursDeNoticeDExemple(): ValeursDeNotice {
  const { notice } = analyserContenus(exempleDeCours());
  if (notice === undefined) throw new Error("la notice de l'exemple est invalide");
  return notice;
}

/** Remplace `avant`, qui doit figurer une seule fois dans le fichier, par `apres`. */
export function modifier(
  fichiers: Map<string, string>,
  chemin: string,
  avant: string,
  apres: string,
): Map<string, string> {
  const texte = fichiers.get(chemin);
  if (texte === undefined) throw new Error(`fichier absent de l'exemple : ${chemin}`);
  if (texte.split(avant).length !== 2) {
    throw new Error(`« ${avant} » doit figurer une seule fois dans ${chemin}`);
  }
  fichiers.set(
    chemin,
    texte.replace(avant, () => apres),
  );
  return fichiers;
}

/** Une instance inventée : des noms factices, et le domaine `exemple.test`. */
const NOTICE = `format: 1
date: "2026-11-03"
fr:
  responsable: "Camille Exemple, à titre privé, qui développe et héberge ancrage. Pour toute question ou demande : contact@exemple.test."
  lieu_du_serveur: "Le serveur d’ancrage est en Exemplie, chez le responsable. Lui seul y a accès."
  tiers_tunnel: "Passerelle (Passerelle SA, Exemplie) relie ton téléphone au serveur : elle voit donc passer les échanges."
  tiers_sauvegardes: "Coffre (Coffre SA, Exemplie) garde les sauvegardes, chiffrées : Coffre ne peut pas les lire."
  transferts: "Aucune donnée ne quitte l’Exemplie."
  qui_ne_voit_pas: "Ni l’équipe enseignante, ni les autres élèves ne voient ta progression."
  sauvegarde_distante: "chez Coffre"
  tunnel: "Passerelle"
  delai_reponse: "15 jours"
  autorites: "à l’autorité de protection des données de l’Exemplie (protection.exemple.test)"
de:
  responsable: "Camille Exemple, als Privatperson, die ancrage entwickelt und betreibt. Für alle Fragen und Anliegen: contact@exemple.test."
  lieu_du_serveur: "Der Server von ancrage steht in Exemplien, bei der Verantwortlichen. Nur sie hat Zugriff darauf."
  tiers_tunnel: "Passerelle (Passerelle AG, Exemplien) verbindet dein Handy mit dem Server und sieht deshalb, was übertragen wird."
  tiers_sauvegardes: "Coffre (Coffre AG, Exemplien) bewahrt die Sicherungskopien verschlüsselt auf: Coffre kann sie nicht lesen."
  transferts: "Keine Daten verlassen Exemplien."
  qui_ne_voit_pas: "Weder die Lehrpersonen noch die anderen Lernenden sehen deinen Lernfortschritt."
  sauvegarde_distante: "bei Coffre"
  tunnel: "Passerelle"
  delai_reponse: "15 Tagen"
  autorites: "bei der Datenschutzbehörde von Exemplien (protection.exemple.test)"
liens:
  - texte: "contact@exemple.test"
    cible: "mailto:contact@exemple.test"
  - texte: "protection.exemple.test"
    cible: "https://protection.exemple.test"
`;

const COURS = `format: 1
id: "j5by5stz"
titre: "Übungskurs"
langue: "de"
types_de_carte:
  b: "Begriff"
  p: "Präfix"
  g: "Gegenteil"
leitner:
  intervalles: [0, 1, 2, 4, 8, 16]
  nouvelles_par_seance: 15
modules:
  - "cartes/01-grundbegriffe.yaml"
  - "cartes/02-vorsilben.yaml"
  - "morphologie.yaml"
  - "schemas/muster.yaml"
  - "textes.yaml"
  - "exercices.yaml"
  - "feuille.yaml"
  - "examen.yaml"
`;

const CARTES_GRUNDBEGRIFFE = `type: "cartes"
id: "epas79zz"
numero: 1
titre: "Anfangskapitel"
statut: "source"
cartes:
  - id: "ed3d8me1"
    type: "b"
    recto: "Musterorgan"
    verso: "Erfundenes Organ für Übungszwecke"
  - id: "zaq3f32b"
    type: "b"
    recto: "Probelappen"
    verso: "Teil des Musterorgans"
    statut: "vérifié"
    verifie_le: "2026-10-01"
  - id: "586my7a4"
    type: "g"
    recto: "warm – kalt"
    verso: "Gegensatzpaar zum Üben"
`;

const CARTES_VORSILBEN = `type: "cartes"
id: "f9qmb1xs"
numero: 2
titre: "Vorsilben"
statut: "à vérifier"
cartes:
  - id: "4g84caqa"
    type: "p"
    recto: "proto-"
    verso: "erfunden, nur zur Übung"
    reponses: ["proto"]
  - id: "rzbyrqna"
    type: "p"
    recto: "kontra-"
    verso: "gegen"
    statut: "source"
`;

const MORPHOLOGIE = `type: "morphologie"
id: "v1xmwpyr"
titre: "Baukasten"
statut: "source"
description: "Rezeptwörter in Teile zerlegen und neu bilden"
chapitres: ["f9qmb1xs"]
morphemes:
  - id: "w59xqe2s"
    categorie: "p"
    forme: "proto-"
    sens: "erfunden"
  - id: "m2x1qnz2"
    categorie: "s"
    forme: "muster"
    sens: "Vorlage"
  - id: "cmfe95c3"
    categorie: "x"
    forme: "-itis"
    sens: "Entzündung"
mots:
  - id: "z4qcq7np"
    mot: "Protomusteritis"
    segments:
      - texte: "Proto"
        morpheme: "w59xqe2s"
      - texte: "muster"
        morpheme: "m2x1qnz2"
      - texte: "itis"
        morpheme: "cmfe95c3"
    sens: "erfundene Entzündung der Vorlage"
  - id: "cv8wvsev"
    mot: "Musteritis"
    segments:
      - texte: "Muster"
        morpheme: "m2x1qnz2"
      - texte: "itis"
        morpheme: "cmfe95c3"
    sens: "Entzündung der Vorlage"
    statut: "à vérifier"
`;

const SCHEMA_MUSTER = `type: "schema"
id: "zp42j4eq"
titre: "Das Musterorgan"
statut: "source"
description: "Übungsschema mit drei Punkten"
dessin: "muster.svg"
note: "Übungsschema ohne Vorbild"
points:
  - id: "khddt0nq"
    x: 40
    y: 30
    terme: "Oberpol"
    sens: "oberes Ende"
  - id: "7czjdx4q"
    x: 100
    y: 50
    terme: "Mitte"
    sens: "Zentrum des Organs"
  - id: "dws2s1yj"
    x: 160
    y: 70
    terme: "Unterpol"
    sens: "unteres Ende"
`;

const DESSIN_MUSTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
<rect x="10" y="10" width="180" height="80" rx="12" fill="none" stroke="currentColor"/>
<circle cx="100" cy="50" r="20"/>
<path d="M40 30 L160 70"/>
</svg>
`;

const TEXTES = `type: "texte-annote"
id: "4gyye686"
titre: "Übungsberichte"
statut: "à vérifier"
description: "Kochbegriffe und Zutaten in Rezepten verstehen"
consigne: "Rezepttexte zum Lesen und Üben – frei erfunden."
reussite: 0.8
textes:
  - id: "pr8zqeth"
    titre: "Bericht 1"
    texte: "Pat. mit [[Mst.|Musteritis|t688vh43]] seit dem Frühstück, [[n. B.|nach Bedarf|90vd725z]] kühlen."
    questions:
      - id: "ba3vg7bf"
        question: "Seit wann bestehen die Beschwerden?"
        reponse: "Seit dem Frühstück"
        distracteurs: ["Seit einer Woche", "Seit Jahren", "Seit heute Morgen"]
      - id: "b8d74bda"
        question: "Was soll man tun?"
        reponse: "Kühlen"
        distracteurs: ["Wärmen", "Ruhen", "Laufen"]
`;

const EXERCICES = `type: "exercices"
id: "xqmqsxxe"
titre: "Grammatik"
statut: "source"
description: "Artikel und Plural zum Üben"
familles:
  - code: "artikel"
    libelle: "Artikel"
    options: ["der", "die", "das"]
    regle: "Die Endung bestimmt das Geschlecht."
    exercices:
      - id: "7g7wk0z1"
        invite: "___ Musterus"
        reponse: "der"
      - id: "301zktwp"
        invite: "___ Probela"
        reponse: "die"
        regle: "Endung -a: Artikel die"
  - code: "plural"
    libelle: "Plural"
    exercices:
      - id: "e5pnxb2n"
        invite: "Musterus → Plural"
        reponse: "Musteri"
      - id: "tvm1e7ah"
        invite: "Probela → Plural"
        reponse: "Probelae"
        statut: "à vérifier"
`;

/**
 * Une feuille de chaque genre de tâche. La feuille est « à vérifier » ; une paire est `vérifié`, la
 * question ouverte `source`. Ses textes ont au moins 12 caractères quand un test cherche ce genre
 * de texte dans le client (`textesDuCours`).
 */
const FEUILLE = `type: "feuille"
id: "9wjxv82j"
numero: 1
titre: "Übungsblatt 1 – Musterkunde"
statut: "à vérifier"
parties:
  - titre: "Teil A: Zuordnungsaufgaben"
    taches:
      - id: "hatk2eac"
        genre: "appariement"
        consigne: "Ordnen Sie die Begriffe den Erklärungen zu."
        paires:
          - id: "4bc2tbhe"
            terme: "Musterorganum"
            cible: "Erfundenes Übungsorgan"
            statut: "vérifié"
            verifie_le: "2026-10-19"
          - id: "m68hg1re"
            terme: "Probelappen"
            cible: "Teil des Musterorgans"
      - id: "h5zv5rdq"
        genre: "classement"
        consigne: "Ordnen Sie die Vorsilben der richtigen Gruppe zu."
        categories: ["Lagebezeichnung", "Mengenangabe"]
        elements:
          - id: "dxqavhcg"
            terme: "supramuster-"
            categorie: "Lagebezeichnung"
          - id: "4rzj4cvb"
            terme: "polymuster-"
            categorie: "Mengenangabe"
  - titre: "Teil B: Auswahlaufgaben"
    taches:
      - id: "gbt5q87v"
        genre: "qcm"
        consigne: "Wählen Sie die richtige Antwort."
        questions:
          - id: "x9wzygy4"
            question: "Was bedeutet die Vorsilbe proto-?"
            reponse: "erfunden, zur Übung"
            distracteurs: ["gegen etwas gerichtet", "halb so gross", "sehr viele davon"]
      - id: "hp0zbdh2"
        genre: "vrai-faux"
        consigne: "Richtig oder falsch?"
        affirmations:
          - id: "npcgzqe2"
            affirmation: "Das Musterorgan ist frei erfunden."
            vrai: true
          - id: "88jvr1wz"
            affirmation: "Die Vorsilbe kontra- bedeutet mit."
            vrai: false
            correction: "Die Vorsilbe kontra- bedeutet gegen."
  - titre: "Teil C: Zutaten ergänzen"
    taches:
      - id: "7p9a5nnf"
        genre: "trous"
        consigne: "Ergänzen Sie die Lücken mit den Wörtern der Liste."
        liste: ["oberes Ende", "unteres Ende", "seitlicher Rand"]
        phrases:
          - id: "ymn0s16n"
            texte: "Der Oberpol ist das ___, der Unterpol das ___."
            reponses: ["oberes Ende", "unteres Ende"]
      - id: "8np95qta"
        genre: "orthographe"
        consigne: "Korrigieren Sie die Schreibweise."
        mots:
          - id: "3kxvpj39"
            fautif: "Probelapenentzündung"
            reponse: "Probelappenentzündung"
  - titre: "Teil D: Offene Fragen"
    taches:
      - id: "mhg83t90"
        genre: "ouverte"
        consigne: "Beantworten Sie die Frage in einem Satz."
        questions:
          - id: "x4jzxbsn"
            question: "Wozu dient das Musterorgan?"
            reponse: "Es dient nur zum Üben der Begriffe."
            statut: "source"
`;

const EXAMEN = `type: "examen"
id: "nex8y92b"
titre: "Probeprüfung zum Üben"
tailles: [20, 30, 50]
taille_par_defaut: 30
secondes_par_question: 45
minutes_minimum: 5
note_suffisante: 4
seuil_chapitre: 0.6
tirage:
  schema: 0.10
  texte: 0.17
  exercice: 0.25
  feuille: 0.35
  mot: 0.12
  direct: 0.45
  a_taper: 0.72
`;

/** Ce que l'analyse retient de l'examen ci-dessus, hors identité du module (1f-D4 : écrit une fois). */
export const REGLAGES_DE_L_EXAMEN = {
  titre: 'Probeprüfung zum Üben',
  tailles: [20, 30, 50],
  tailleParDefaut: 30,
  secondesParQuestion: 45,
  minutesMinimum: 5,
  noteSuffisante: 4,
  seuilChapitre: 0.6,
  tirage: {
    schema: 0.1,
    texte: 0.17,
    exercice: 0.25,
    feuille: 0.35,
    mot: 0.12,
    direct: 0.45,
    aTaper: 0.72,
  },
};

const CONTENU_DU_VERROU = `# Tous les identifiants jamais émis dans ce contenu (ADR-0003). Ce fichier ne fait que grandir.
# Une ligne par identifiant : « <id> », ou « <id> retiré » quand l'élément a été supprimé.
# Nouvel élément : pnpm contenus:id, puis pnpm contenus:verrouiller.
j5by5stz
epas79zz
ed3d8me1
zaq3f32b
586my7a4
zdpn0x9s retiré
f9qmb1xs
4g84caqa
rzbyrqna
v1xmwpyr
w59xqe2s
m2x1qnz2
cmfe95c3
z4qcq7np
cv8wvsev
zp42j4eq
khddt0nq
7czjdx4q
dws2s1yj
4gyye686
pr8zqeth
t688vh43
90vd725z
ba3vg7bf
b8d74bda
xqmqsxxe
7g7wk0z1
301zktwp
e5pnxb2n
tvm1e7ah
nex8y92b
9wjxv82j
hatk2eac
4bc2tbhe
m68hg1re
h5zv5rdq
dxqavhcg
4rzj4cvb
gbt5q87v
x9wzygy4
hp0zbdh2
npcgzqe2
88jvr1wz
7p9a5nnf
ymn0s16n
8np95qta
3kxvpj39
mhg83t90
x4jzxbsn
`;
