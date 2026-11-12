/*
 * Les libellés de l'interface d'un cours, dans la langue du cours (décision 3) : les phrases
 * allemandes du prototype, mot pour mot, avec des repères `{nom}` pour les valeurs (`formater`).
 * Le français viendra avec un premier cours en français.
 *
 * Aucun texte de cours ici (invariant 3) : les titres, les descriptions et tout ce qui cite le
 * contenu viennent de l'API à l'exécution. C'est pourquoi les onglets des modules `morphologie`,
 * `texte-annote`, `exercices` et `examen` n'ont pas de libellé ici : ils prennent le titre de leur
 * module (décision 19).
 */

const de = {
  // Les onglets dont le libellé n'est pas le titre d'un module (H:199-208).
  onglet_heute: 'Heute',
  onglet_apercu: 'Übersicht',
  onglet_cartes: 'Karteikarten',
  onglet_quiz: 'Quiz',
  onglet_schemas: 'Schemata',
  // Les fiches d'exercices des Units : un onglet pour toutes, pas un par module (F1-D1).
  onglet_feuilles: 'Arbeitsblätter',
  onglet_progression: 'Fortschritt',

  // La séance du jour (M2) : ce qui est dû aujourd'hui, de tous les types, puis des cartes neuves.
  heute_compte: '{dues} fällig · {neues} neu',
  heute_progression: '{faites} beantwortet · {restantes} offen',
  heute_fin: 'Runde geschafft!',
  heute_resultat: '{justes} von {faites} richtig.',
  heute_reste: 'Noch {n} fällig.',
  heute_encore: 'Nächste Runde',
  heute_rien: 'Heute ist nichts fällig.',
  heute_rien_suite: 'In den anderen Bereichen kannst du frei üben.',
  heute_vers_apercu: 'Zur Übersicht',

  // L'état de la synchronisation, en tête du cours (H:197, H:1595-1605).
  synchro_en_cours: 'Speichere …',
  synchro_a_jour: 'Gespeichert in deinem Konto',
  synchro_une_en_attente: '1 Antwort wartet auf Verbindung',
  synchro_en_attente: '{n} Antworten warten auf Verbindung',
  // Le stockage de l'appareil (IndexedDB) ne s'ouvre pas : rien n'est gardé ici (pas dans le
  // prototype, dont le stockage ne pouvait pas manquer ainsi).
  synchro_stockage_indisponible: 'Speicher nicht verfügbar',

  // Le stockage de l'appareil a refusé une réponse (pas dans le prototype : son enregistrement ne
  // pouvait pas échouer ainsi).
  erreur_enregistrement: 'Antwort konnte nicht gespeichert werden.',

  // L'onglet dont l'affichage a échoué, sous le filet de `CoursOuvert` (1e-D13) : pas dans le
  // prototype, qui n'avait pas ce filet.
  onglet_en_erreur: 'Dieser Bereich konnte nicht angezeigt werden.',
  recharger: 'Neu laden',

  // Les deux sens d'une carte (H:1701).
  sens_direct: 'Begriff → Bedeutung',
  sens_inverse: 'Bedeutung → Begriff',

  // Übersicht (H:1712-1739).
  apercu_sures: 'Fragen sicher gewusst',
  apercu_dues: 'heute zu wiederholen',
  apercu_mots: 'Wörter zerlegt / gebildet',
  apercu_derniere_note: 'letzte Prüfungsnote',
  apercu_aucun_examen: 'noch keine Probeprüfung',
  apercu_deux_sens: 'Jede Karte wird in beide Richtungen abgefragt: {direct} und {inverse}.',
  apercu_serie: '{serie} Tage in Folge gelernt · {aujourdhui} Antworten heute.',
  apercu_chapitres: 'Kapitel',
  apercu_chapitre: '{sures}/{total} sicher · {dues} fällig · {neues} neu',
  apercu_lernen: 'Lernen',
  apercu_legende_neu: 'neu / Fach 1',
  apercu_legende_fach: 'Fach {n}',
  apercu_legende_sicher: 'Fach {n} · sicher',
  apercu_weitere: 'Weitere Übungen',
  apercu_ueben: 'Üben',
  // La ligne des fiches (F1-D12), pas dans le prototype : le singulier pour une seule.
  apercu_feuille_une: '1 Arbeitsblatt',
  apercu_feuilles: '{n} Arbeitsblätter',

  // Les choix communs aux cartes et au quiz (H:1701-1705).
  choix_chapitre: 'Kapitel',
  choix_sens: 'Richtung',
  choix_tous_chapitres: 'Alle Kapitel',
  choix_sens_mixte: 'Gemischt',
  carte_chapitre: 'Kap. {n}',

  // Karteikarten (H:1742-1818).
  cartes_saisie: 'Begriffe eintippen',
  cartes_progression: '{faites} beantwortet · {restantes} übrig',
  cartes_de_l_examen: 'Fehler aus der Prüfung',
  cartes_retourner: 'Karte umdrehen',
  cartes_indice: 'Antwort überlegen, dann tippen zum Umdrehen',
  cartes_pas_su: 'Nicht gewusst',
  cartes_su: 'Gewusst',
  cartes_touches: 'Leertaste = umdrehen · 1 = nicht gewusst · 2 = gewusst',
  cartes_boite: 'Fach {n}',
  cartes_neuve: 'neue Karte',
  cartes_saisie_etiquette: 'Fachbegriff eintippen',
  cartes_saisie_modele: 'Fachbegriff …',
  cartes_verifier: 'Prüfen',
  cartes_saisie_indice: 'Weisst du es nicht? Leer lassen und «Prüfen».',
  cartes_juste: 'Richtig!',
  cartes_presque: 'Fast – achte auf die Schreibweise',
  cartes_fausse: 'Leider falsch',
  cartes_aussi_juste: 'Meine Antwort war auch richtig',
  cartes_suivante: 'Weiter',
  cartes_touches_saisie: 'Enter = prüfen / weiter',
  cartes_serie_finie: 'Runde geschafft',
  cartes_rien_a_reviser: 'Für heute ist hier alles wiederholt',
  cartes_resultat: '{justes} von {faites} richtig.',
  cartes_retour_des_dues: 'Fällige Karten kommen an den nächsten Tagen automatisch wieder.',
  cartes_plus: 'Weitere neue Karten',
  cartes_vers_quiz: 'Zum Quiz',

  // Quiz (H:1836-1851).
  quiz_resultat: '{justes} / {faites} richtig',
  quiz_suivante: 'Nächste Frage',
  quiz_touches: 'Tastatur: 1–4 wählen · Enter = weiter',
  // Le prototype n'a pas cet état : un choix sans carte y faisait planter le quiz.
  quiz_vide: 'Keine Fragen in dieser Auswahl',

  // Ce que se partagent les exercices annexes (H:1873-2197).
  choix_exercice: 'Übung',
  choix_melange: 'Gemischt',
  serie_resultat: '{justes} / {faites} richtig',
  verdict_juste: 'Richtig!',
  verdict_fausse: 'Leider falsch',
  suivante: 'Weiter',
  pruefen: 'Prüfen',
  // Le prototype n'a pas cet état : un tirage sans élément y faisait planter l'onglet.
  onglet_vide: 'Keine Aufgaben in dieser Auswahl',

  // Wortbaukasten (H:1862-1928).
  mots_choix_zerlegen: 'Wörter zerlegen',
  mots_choix_bilden: 'Wörter bilden',
  mots_geschafft: '{n} von {total} Wörtern geschafft',
  mots_zerlegen_partie: 'Wort zerlegen · Teil {n} von {total}',
  mots_was_bedeutet: 'Was bedeutet {forme} ({categorie})?',
  mots_prefixe: 'Präfix',
  mots_radical: 'Wortstamm',
  mots_suffixe: 'Suffix',
  mots_naechstes: 'Nächstes Wort',
  mots_bilden: 'Wort bilden',
  mots_indice_tuiles: 'Bausteine in der richtigen Reihenfolge antippen',
  mots_nicht_ganz: 'Nicht ganz',
  mots_retirer: 'Letzten entfernen',
  mots_touches: 'Zerlegen: 1–4 wählen · Enter = weiter',

  // Schemata (H:2072-2110).
  schemas_choix: 'Schema',
  schemas_benennen: 'Benennen',
  schemas_zeigen: 'Zeigen',
  schemas_lernansicht: 'Lernansicht',
  schemas_gekonnt: '{n} von {total} Strukturen gekonnt',
  schemas_nummer: 'Nummer {n}',
  schemas_wie_heisst: 'Wie heisst {nummer}?',
  schemas_tippe_auf: 'Tippe auf: {terme}',

  // Berichte (H:2113-2170).
  textes_choix: 'Bericht',
  textes_geschafft: '{n} von {total} Berichten geschafft',
  textes_anleitung: 'Erst die markierten Begriffe übersetzen, dann Fragen zum Inhalt beantworten.',
  textes_begriff: 'Begriff {n} von {total}: Was bedeutet {forme}?',
  textes_frage: 'Frage {n} von {total}: {frage}',
  textes_alles_richtig: 'Alles richtig!',
  textes_abgeschlossen: 'Bericht abgeschlossen',
  textes_bilan:
    '{termes_justes} von {termes} Begriffen richtig übersetzt · {questions_justes} von {questions} Inhaltsfragen richtig.',
  textes_naechster: 'Nächster Bericht',
  textes_nochmals: 'Nochmals',

  // Grammatik (H:2173-2197).
  exercices_gekonnt: '{n} von {total} Aufgaben gekonnt',
  exercices_antwort: 'Antwort',
  exercices_antwort_modele: 'Antwort …',
  exercices_hinweis: 'Hier zählt die genaue Schreibweise.',

  // Arbeitsblätter (F1, ancrage-donnees#90), pas dans le prototype.
  feuilles_score: '{justes}/{total} richtig',
  feuilles_bearbeiten: 'Bearbeiten',
  feuilles_fehler: 'Fehler wiederholen',
  // Une fiche entamée se reprend aux éléments jamais répondus, ou se refait en entier (F1-R20).
  feuilles_weitermachen: 'Weitermachen',
  feuilles_neu_beginnen: 'Neu beginnen',
  // « Schritt », pas « Aufgabe » : le compteur des écrans ne doit pas passer pour le numéro d'une
  // tâche du papier, que la consigne porte (« Aufgabe 1: … »).
  feuilles_aufgabe: 'Schritt {n} von {total}',
  feuilles_bilan: '{justes} von {total} richtig',
  feuilles_zurueck: 'Zurück zu den Arbeitsblättern',
  feuille_richtig: 'Richtig',
  feuille_falsch: 'Falsch',
  feuilles_zeigen: 'Antwort zeigen',
  feuilles_luecke: 'Lücke {n}',
  // Le nom d'une case pleine : le lecteur d'écran dit aussi le mot posé.
  feuilles_luecke_mit: 'Lücke {n}: {mot}',
  feuilles_hinweis_ziehen: 'Begriff ziehen oder antippen, dann das Feld antippen.',
  // La Prüfung pose un mot à corriger : on y tape la forme correcte.
  feuilles_korrigieren: 'Richtig schreiben: {fautif}',

  // La vue Ergebnis (F3, ancrage-donnees#175).
  feuilles_ergebnis: 'Ergebnis',
  feuilles_ergebnis_hinweis:
    'Es zählt jeweils deine letzte Antwort, auch die aus dem Quiz und der Prüfung.',
  feuilles_ergebnis_selbst: 'Hier hast du selbst eingeschätzt, ob du die Antwort wusstest.',
  feuilles_ergebnis_loesung: 'Lösung: {loesung}',
  feuilles_ergebnis_richtig: 'Richtig · {datum}',
  feuilles_ergebnis_falsch: 'Falsch · {datum}',
  feuilles_ergebnis_offen: 'Noch nicht beantwortet',

  // Prüfung (H:2004-2069). La note suffisante de l'anleitung (« ab 4 bestanden ») et la durée par
  // question viennent du module `examen` du cours, pas du texte.
  examen_titre: 'Probeprüfung',
  examen_anleitung:
    'Gemischte Fragen aus den gewählten Kapiteln: Multiple Choice in beide Richtungen, Fachbegriffe eintippen und Wörter zerlegen. Die Lösungen siehst du erst am Ende. Note nach Schweizer Skala: 6 = beste Note, ab {note} bestanden.',
  examen_fragen: 'Fragen',
  examen_chrono: 'mit Zeitlimit ({secondes} s pro Frage)',
  examen_avec_modules: 'mit Schemata, Berichten, Grammatik und Arbeitsblättern',
  examen_alle: 'Alle',
  examen_keine: 'Keine',
  examen_starten: 'Prüfung starten',
  examen_frage: 'Frage {n} / {total} · {beantwortet} beantwortet',
  examen_abgeben: 'Abgeben',
  examen_jetzt_abgeben: 'Jetzt abgeben?',
  examen_zurueck: 'Zurück',
  examen_ueberspringen: 'Überspringen',
  examen_zur_abgabe: 'Zur Abgabe',
  examen_antwort: 'Antwort',
  examen_antwort_modele: 'Fachbegriff …',
  examen_eintippen: 'eintippen',
  examen_wort_zerlegen: 'Wort zerlegen',
  examen_schema: 'Schema',
  examen_bericht: 'Bericht · {titre}',
  examen_was_bedeutet: 'Was bedeutet «{forme}»?',
  examen_resultat: 'Resultat',
  examen_bestanden: 'bestanden',
  examen_nicht_bestanden: 'nicht bestanden',
  examen_punkte: '{points} von {questions} Punkten ({pourcent} %) · {minutes} Min.',
  examen_nach_kapitel: 'Nach Kapitel',
  examen_kapitel: 'Kapitel {n}',
  examen_richtig: '{justes} / {total} richtig',
  examen_fehler: 'Fehler ({n})',
  examen_keine_fehler: 'Keine Fehler – ausgezeichnet!',
  examen_fehler_ueben: 'Fehler als Karteikarten üben',
  examen_neue: 'Neue Prüfung',

  // Fortschritt (H:2200-2216), sans « Neu anfangen » (décision 2). Les totaux d'un module que le
  // cours n'a pas manquent, ils ne valent pas zéro. Le prototype écrit le titre du module des mots
  // dans sa phrase (« im Wortbaukasten ») : ce titre est un texte du cours, il vient de l'API.
  progression_jours: 'Letzte 14 Tage',
  progression_jour: '{jour}: {n} Antworten',
  progression_antworten: '{n} Antworten insgesamt',
  progression_serie: '{n} Tage in Folge',
  progression_mots: '{n} von {total} Wörtern im {module}',
  progression_schemas: '{n} von {total} Strukturen in den Schemata',
  progression_textes: '{n} von {total} Berichten',
  progression_exercices: '{n} von {total} Grammatik-Aufgaben',
  progression_examens: 'Probeprüfungen',
  progression_examen: '{points} / {questions} Punkte · {chapitres} Kapitel · {minutes} Min.',
  progression_note: 'Note {note}',
  progression_aucun_examen: 'Noch keine Probeprüfung – im Tab «{onglet}» starten.',
  progression_difficiles: 'Schwierige Karten',
  progression_fausses: '{n}× falsch',
  progression_aucune_faute:
    'Noch keine Fehler – sobald eine Karte falsch beantwortet wird, erscheint sie hier.',
} as const;

export type CleTexteCours = keyof typeof de;

export const TEXTES_COURS: { de: Record<CleTexteCours, string> } = { de };

/** Les libellés dans la langue d'un cours ; l'allemand pour une langue qui n'en a pas encore. */
export function textesDuCours(langue: string): Record<CleTexteCours, string> {
  return Object.hasOwn(TEXTES_COURS, langue)
    ? TEXTES_COURS[langue as keyof typeof TEXTES_COURS]
    : TEXTES_COURS.de;
}

/**
 * Le modèle avec chaque repère `{nom}` remplacé par sa valeur. Un repère sans valeur reste tel
 * quel, et une valeur n'est jamais relue comme un modèle.
 */
export function formater(modele: string, valeurs: Record<string, string | number>): string {
  return modele.replace(/\{([a-z_]+)\}/g, (repere, nom: string) =>
    Object.hasOwn(valeurs, nom) ? String(valeurs[nom]) : repere,
  );
}
