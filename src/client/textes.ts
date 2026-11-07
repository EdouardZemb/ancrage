/*
 * Les libellés de l'interface, en allemand et en français, avec exactement les mêmes clés (le test
 * `textes_memes_cles_en_de_et_fr` le vérifie). Aucun texte de cours ici : les titres des cours
 * viennent de l'API à l'exécution (invariant 3). Seule l'administration est en français
 * seulement : ses libellés sont dans `textesAdmin`.
 */
import { NOM_AFFICHE_MAX } from '../domaine/nom-affiche.js';

export type Langue = 'de' | 'fr';

/** Les langues de l'interface, dans l'ordre des boutons qui les choisissent. */
export const LANGUES: readonly Langue[] = ['de', 'fr'];

const fr = {
  // Commun
  chargement: 'Chargement…',
  serveur_injoignable: 'Serveur injoignable',
  version_appareil: 'Appareil : {revision}',
  reessayer: 'Réessayer',
  retour_accueil: '← Accueil',

  // L'écran dont l'affichage a échoué, sous le filet de `MiseEnPage` (1e-D13)
  ecran_en_erreur: 'Cet écran n’a pas pu s’afficher.',
  recharger: 'Recharger',

  // Erreurs de l'API et de la passkey : `erreur_<code>` pour chaque code de `api.ts`
  erreur_inconnue: 'Une erreur est survenue. Réessaie dans un instant.',
  erreur_reseau: 'Le serveur ne répond pas. Vérifie ta connexion, puis réessaie.',
  erreur_trop_de_requetes: 'Trop de tentatives. Attends une minute, puis réessaie.',
  erreur_lien_invalide:
    'Ce lien n’est plus valable : il a expiré ou il a déjà servi. Demande-en un nouveau.',
  erreur_connexion_impossible:
    'Connexion impossible avec cette passkey. Réessaie, ou demande un lien de secours.',
  erreur_requete: 'La demande a été refusée. Vérifie les informations saisies.',
  erreur_introuvable: 'Cet élément n’existe plus. Recharge la page.',
  erreur_non_connecte: 'Ta session a pris fin. Reconnecte-toi.',
  erreur_autre_personne: 'Une autre personne est connectée sur cet appareil. Reconnecte-toi.',
  erreur_derniere_passkey:
    'C’est ta dernière passkey : elle ne peut pas être supprimée, sinon tu perdrais l’accès. Ajoute d’abord une passkey sur un autre appareil.',
  erreur_proprietaire: 'Le compte du propriétaire ne se supprime pas depuis l’application.',
  erreur_interne: 'Erreur du serveur. Réessaie plus tard.',
  passkey_annulee: 'Opération annulée. Appuie de nouveau sur le bouton pour réessayer.',
  passkey_deja_enregistree: 'Une passkey d’ancrage existe déjà sur cet appareil.',
  passkey_echec:
    'La passkey n’a pas pu être utilisée sur cet appareil. Vérifie que le verrouillage de l’écran est activé, puis réessaie.',

  // Connexion
  connexion_titre: 'Connexion',
  connexion_aide: 'Utilise la passkey enregistrée sur cet appareil.',
  connexion_bouton: 'Se connecter avec une passkey',
  connexion_en_cours: 'Connexion…',
  connexion_sans_passkey:
    'Pas encore de passkey sur cet appareil ? Ouvre le lien d’invitation ou de secours que tu as reçu.',
  // Affiché sur l'écran de connexion après la suppression du compte (`/connexion?compte=supprime`).
  compte_supprime: 'Ton compte a été supprimé.',
  // Le compte a été supprimé depuis un autre appareil, et celui-ci s'est vidé (2d-D6).
  compte_supprime_appareil_vide: 'Ton compte a été supprimé. Cet appareil a été vidé.',
  // Le compte est supprimé, mais l'appareil n'a pas pu effacer ses données (1e-R14). « cet
  // appareil », comme ailleurs dans ce fichier (1f-D13).
  compte_supprime_appareil_non_efface:
    'Ton compte a été supprimé, mais les données de cet appareil n’ont pas pu être effacées : efface les données du site dans les réglages du navigateur.',

  // Invitation et lien de secours
  invitation_titre: 'Bienvenue',
  invitation_intro:
    'Choisis le nom affiché dans ancrage, puis crée ta passkey : elle remplace le mot de passe et se déverrouille avec ton téléphone.',
  lien_titre: 'Nouvel appareil',
  lien_intro: 'Crée une passkey sur cet appareil pour retrouver ton compte.',
  nom_affiche: 'Nom affiché',
  nom_requis: `Écris un nom de ${NOM_AFFICHE_MAX} caractères au plus, sans caractère invisible.`,
  langue_choix: 'Langue',
  langue_de: 'Deutsch',
  langue_fr: 'Français',
  creer_passkey: 'Créer ma passkey',
  creation_en_cours: 'Création…',

  // En-tête : le lien vers le compte
  compte_lien: 'Compte',
  // Pied de page : le lien vers la notice de confidentialité, sur tous les écrans (1e-D15)
  notice_lien: 'Confidentialité',
  // La notice sans réseau, et sans copie sur l'appareil (S1-D8, S1-D9)
  notice_hors_ligne: 'Cette page s’affiche quand l’appareil est en ligne.',

  // La session vue de l'appareil (décisions 14 et 15) : le bandeau au-dessus de chaque écran, et
  // le démarrage sans réseau d'un appareil qui ne connaît personne.
  session_hors_ligne: 'Hors ligne – tes réponses seront synchronisées plus tard',
  session_expiree: 'Session expirée – reconnecte-toi',
  sans_connexion: 'Pas de connexion',
  // L'appareil n'a pas pu être réservé à la personne qui se connecte (R35).
  stockage_en_echec:
    'Cet appareil n’a pas pu effacer les données de la personne précédente. Recharge la page pour réessayer.',

  // Compte
  bonjour: 'Bonjour',
  cours_titre: 'Mes cours',
  cours_aucun: 'Aucun cours pour le moment.',
  appareils_titre: 'Mes appareils',
  admin_lien: 'Administration',
  deconnexion: 'Se déconnecter',
  // La déconnexion n'efface rien tant que des réponses n'ont pas pu partir pour une cause
  // passagère ; le message dit laquelle, et quoi faire (R31b).
  deconnexion_attente_reseau:
    'Des réponses n’ont pas encore été envoyées, rien n’a été effacé. Vérifie ta connexion, puis réessaie.',
  deconnexion_attente_session:
    'Des réponses n’ont pas encore été envoyées, rien n’a été effacé. Reconnecte-toi pour les envoyer, puis déconnecte-toi.',
  deconnexion_attente_serveur:
    'Des réponses n’ont pas encore été envoyées, rien n’a été effacé. Le serveur ne les a pas reçues : réessaie dans un instant.',
  // Le bouton qui suit un de ces messages : se déconnecter quand même, en perdant les réponses en
  // attente (1e-D11). `{n}` : leur nombre, mis par `formater`. Une seule réponse a ses formes
  // (`_une`, 1e-R10), comme `synchro_une_en_attente` des textes du cours.
  deconnexion_abandonner: 'Se déconnecter et abandonner {n} réponses',
  deconnexion_abandonner_une: 'Se déconnecter et abandonner 1 réponse',
  deconnexion_abandonner_confirmer: 'Confirmer : {n} réponses seront perdues',
  deconnexion_abandonner_confirmer_une: 'Confirmer : 1 réponse sera perdue',
  langue_interface: 'Langue de l’interface',
  nom_titre: 'Ton nom affiché',
  enregistrer: 'Enregistrer',
  // Les données de la personne (1e-D4, 1e-D5) : leur export, et la suppression du compte. La
  // suppression vide le serveur et cet appareil ; les autres appareils se vident à leur prochain
  // contact avec le serveur, dans les 100 jours de la session, sinon ils gardent leur copie
  // jusqu'à la déconnexion (2d-D5).
  donnees_titre: 'Mes données',
  export_lien: 'Télécharger mes données',
  suppression_bouton: 'Supprimer mon compte',
  suppression_confirmer: 'Confirmer la suppression',
  suppression_explication:
    'Ton compte, ta progression et tes passkeys sont effacés du serveur tout de suite et définitivement, et cet appareil est vidé. Tes autres appareils se vident à leur prochain contact avec le serveur, s’ils le font dans les 100 jours ; au-delà, ils gardent leur copie jusqu’à ce que tu t’y déconnectes. Les sauvegardes gardent tes données encore 90 jours environ.',
  // La suppression a échoué faute de réponse, ou trouve la session partie : le serveur a pu
  // supprimer le compte sans que le téléphone le sache, et rien n'est effacé ici. La déconnexion,
  // au besoin en abandonnant la file, efface l'appareil (I2).
  suppression_erreur_reseau:
    'Le serveur ne répond pas : ton compte a peut-être déjà été supprimé. Réessaie quand tu as du réseau. Si c’est le cas, touche « Se déconnecter » pour effacer cet appareil, au besoin en abandonnant les réponses en attente.',
  suppression_erreur_non_connecte:
    'Ta session a pris fin : ton compte a peut-être déjà été supprimé. Touche « Se déconnecter » pour effacer cet appareil, au besoin en abandonnant les réponses en attente.',

  // Un cours que le serveur ne connaît pas, ou plus pour cette personne : la langue du cours
  // n'étant pas connue, le message est dans celle de la personne.
  cours_introuvable: 'Cours introuvable.',
  // Le serveur a servi le cours sous une forme que cette version de l'application ne sait pas
  // afficher (un retour arrière), et l'appareil n'en a pas de copie.
  cours_indisponible: 'Cours indisponible pour le moment.',

  // Appareils
  sessions_titre: 'Appareils connectés',
  passkeys_titre: 'Passkeys',
  passkeys_aide: 'Chaque passkey ouvre ton compte depuis un appareil.',
  cet_appareil: 'Cet appareil',
  appareil_autre: 'Autre appareil',
  depuis: 'Depuis le',
  derniere_activite: 'Dernière activité',
  jamais_utilisee: 'Jamais utilisée',
  deconnecter: 'Déconnecter',
  supprimer: 'Supprimer',
  // Le second temps d'une action qui ne se défait pas (`BoutonConfirme`).
  confirmer: 'Confirmer ?',
  lien_autre_appareil: 'Lien pour un autre appareil',
  lien_autre_appareil_aide:
    'Ouvre ce lien sur l’autre appareil pour y créer une passkey. Il est valable 24 heures et ne sert qu’une fois.',
  // Le lien actif, que la personne peut annuler : un seul à la fois (1e-D7). `{date}` : son échéance.
  lien_actif: 'Un lien est actif jusqu’au {date}.',
  lien_annuler: 'Annuler le lien',
  lien_remplace: 'Créer un lien annule le précédent.',

  // Partage d'un lien
  lien_secret: 'Ce lien donne accès à un compte : ne le montre à personne d’autre.',
  partager: 'Partager',
  copier: 'Copier le lien',
  lien_copie: 'Lien copié.',
  copie_impossible: 'Copie impossible. Sélectionne le lien et copie-le à la main.',
} as const;

export type CleTexte = keyof typeof fr;

const de: Record<CleTexte, string> = {
  chargement: 'Wird geladen …',
  serveur_injoignable: 'Server nicht erreichbar',
  version_appareil: 'Gerät: {revision}',
  reessayer: 'Erneut versuchen',
  retour_accueil: '← Startseite',

  ecran_en_erreur: 'Diese Seite konnte nicht angezeigt werden.',
  recharger: 'Neu laden',

  erreur_inconnue: 'Es ist ein Fehler aufgetreten. Versuche es gleich noch einmal.',
  erreur_reseau: 'Der Server antwortet nicht. Prüfe deine Verbindung und versuche es erneut.',
  erreur_trop_de_requetes: 'Zu viele Versuche. Warte eine Minute und versuche es dann erneut.',
  erreur_lien_invalide:
    'Dieser Link ist nicht mehr gültig: Er ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.',
  erreur_connexion_impossible:
    'Anmeldung mit diesem Passkey nicht möglich. Versuche es erneut oder fordere einen Notfall-Link an.',
  erreur_requete: 'Die Anfrage wurde abgelehnt. Prüfe deine Eingaben.',
  erreur_introuvable: 'Dieses Element gibt es nicht mehr. Lade die Seite neu.',
  erreur_non_connecte: 'Deine Sitzung ist beendet. Melde dich erneut an.',
  erreur_autre_personne:
    'Auf diesem Gerät ist eine andere Person angemeldet. Melde dich erneut an.',
  erreur_derniere_passkey:
    'Das ist dein letzter Passkey. Er kann nicht gelöscht werden, sonst verlierst du den Zugang. Füge zuerst auf einem anderen Gerät einen Passkey hinzu.',
  erreur_proprietaire: 'Das Konto des Eigentümers kann nicht in der App gelöscht werden.',
  erreur_interne: 'Serverfehler. Versuche es später noch einmal.',
  passkey_annulee:
    'Abgebrochen. Tippe erneut auf die Schaltfläche, um es noch einmal zu versuchen.',
  passkey_deja_enregistree: 'Auf diesem Gerät gibt es schon einen ancrage-Passkey.',
  passkey_echec:
    'Der Passkey konnte auf diesem Gerät nicht verwendet werden. Prüfe, ob die Bildschirmsperre aktiviert ist, und versuche es erneut.',

  connexion_titre: 'Anmelden',
  connexion_aide: 'Verwende den Passkey, der auf diesem Gerät gespeichert ist.',
  connexion_bouton: 'Mit Passkey anmelden',
  connexion_en_cours: 'Anmeldung …',
  connexion_sans_passkey:
    'Noch kein Passkey auf diesem Gerät? Öffne den Einladungs- oder Notfall-Link, den du bekommen hast.',
  compte_supprime: 'Dein Konto wurde gelöscht.',
  compte_supprime_appareil_vide: 'Dein Konto wurde gelöscht. Dieses Gerät wurde geleert.',
  compte_supprime_appareil_non_efface:
    'Dein Konto wurde gelöscht, aber die Daten auf diesem Gerät konnten nicht gelöscht werden: Lösche die Websitedaten in den Einstellungen des Browsers.',

  invitation_titre: 'Willkommen',
  invitation_intro:
    'Wähle den Namen, der in ancrage angezeigt wird, und erstelle dann deinen Passkey. Er ersetzt das Passwort und wird mit deinem Handy entsperrt.',
  lien_titre: 'Neues Gerät',
  lien_intro: 'Erstelle auf diesem Gerät einen Passkey, um dein Konto wiederzufinden.',
  nom_affiche: 'Anzeigename',
  nom_requis: `Gib einen Namen mit höchstens ${NOM_AFFICHE_MAX} Zeichen ein, ohne unsichtbare Zeichen.`,
  langue_choix: 'Sprache',
  langue_de: 'Deutsch',
  langue_fr: 'Français',
  creer_passkey: 'Meinen Passkey erstellen',
  creation_en_cours: 'Wird erstellt …',

  compte_lien: 'Konto',
  notice_lien: 'Datenschutz',
  notice_hors_ligne: 'Diese Seite erscheint, wenn das Gerät online ist.',

  session_hors_ligne: 'Offline – deine Antworten werden später synchronisiert',
  session_expiree: 'Sitzung abgelaufen – bitte neu anmelden',
  sans_connexion: 'Keine Verbindung',
  stockage_en_echec:
    'Dieses Gerät konnte die Daten der vorherigen Person nicht löschen. Lade die Seite neu, um es erneut zu versuchen.',

  bonjour: 'Hallo',
  cours_titre: 'Meine Kurse',
  cours_aucun: 'Im Moment keine Kurse.',
  appareils_titre: 'Meine Geräte',
  admin_lien: 'Administration',
  deconnexion: 'Abmelden',
  deconnexion_attente_reseau:
    'Einige Antworten wurden noch nicht gesendet, es wurde nichts gelöscht. Prüfe deine Verbindung und versuche es erneut.',
  deconnexion_attente_session:
    'Einige Antworten wurden noch nicht gesendet, es wurde nichts gelöscht. Melde dich erneut an, damit sie gesendet werden, und melde dich dann ab.',
  deconnexion_attente_serveur:
    'Einige Antworten wurden noch nicht gesendet, es wurde nichts gelöscht. Der Server hat sie nicht erhalten: Versuche es gleich noch einmal.',
  deconnexion_abandonner: 'Abmelden und {n} Antworten verwerfen',
  deconnexion_abandonner_une: 'Abmelden und 1 Antwort verwerfen',
  deconnexion_abandonner_confirmer: 'Bestätigen: {n} Antworten gehen verloren',
  deconnexion_abandonner_confirmer_une: 'Bestätigen: 1 Antwort geht verloren',
  langue_interface: 'Sprache der Oberfläche',
  nom_titre: 'Dein Anzeigename',
  enregistrer: 'Speichern',
  donnees_titre: 'Meine Daten',
  export_lien: 'Meine Daten herunterladen',
  suppression_bouton: 'Mein Konto löschen',
  suppression_confirmer: 'Löschen bestätigen',
  suppression_explication:
    'Dein Konto, dein Lernfortschritt und deine Passkeys werden sofort und endgültig vom Server gelöscht, und dieses Gerät wird geleert. Deine anderen Geräte leeren sich, sobald sie das nächste Mal den Server erreichen, sofern das innert 100 Tagen geschieht. Erreichen sie ihn erst später, behalten sie ihre Kopie, bis du dich dort abmeldest. Die Sicherungskopien enthalten deine Daten noch etwa 90 Tage.',
  suppression_erreur_reseau:
    'Der Server antwortet nicht: Dein Konto wurde vielleicht schon gelöscht. Versuche es erneut, sobald du eine Verbindung hast. Wenn es gelöscht ist, tippe auf «Abmelden», um dieses Gerät zu leeren, und verwirf falls nötig die wartenden Antworten.',
  suppression_erreur_non_connecte:
    'Deine Sitzung ist beendet: Dein Konto wurde vielleicht schon gelöscht. Tippe auf «Abmelden», um dieses Gerät zu leeren, und verwirf falls nötig die wartenden Antworten.',

  cours_introuvable: 'Kurs nicht gefunden.',
  cours_indisponible: 'Kurs zurzeit nicht verfügbar.',

  sessions_titre: 'Angemeldete Geräte',
  passkeys_titre: 'Passkeys',
  passkeys_aide: 'Jeder Passkey öffnet dein Konto von einem Gerät aus.',
  cet_appareil: 'Dieses Gerät',
  appareil_autre: 'Anderes Gerät',
  depuis: 'Seit dem',
  derniere_activite: 'Zuletzt aktiv',
  jamais_utilisee: 'Noch nie benutzt',
  deconnecter: 'Abmelden',
  supprimer: 'Löschen',
  confirmer: 'Bestätigen?',
  lien_autre_appareil: 'Link für ein anderes Gerät',
  lien_autre_appareil_aide:
    'Öffne diesen Link auf dem anderen Gerät, um dort einen Passkey zu erstellen. Er ist 24 Stunden gültig und kann nur einmal benutzt werden.',
  lien_actif: 'Ein Link ist gültig bis {date}.',
  lien_annuler: 'Link widerrufen',
  lien_remplace: 'Ein neuer Link ersetzt den vorherigen.',

  lien_secret: 'Dieser Link gibt Zugang zu einem Konto. Zeige ihn niemandem sonst.',
  partager: 'Teilen',
  copier: 'Link kopieren',
  lien_copie: 'Link kopiert.',
  copie_impossible: 'Kopieren nicht möglich. Markiere den Link und kopiere ihn von Hand.',
};

export const textes: Record<Langue, Record<CleTexte, string>> = { de, fr };

/** Les libellés de l'administration, en français seulement (décision 2). */
export const textesAdmin = {
  admin_titre: 'Administration',
  erreur_nom_deja_pris: 'Un groupe porte déjà ce nom.',
  erreur_cours_a_verifier_sans_derogation:
    'Ce cours contient des éléments « à vérifier » : il ne peut pas être ouvert à un groupe tant que son manifeste ne porte pas de dérogation de diffusion écrite. Il peut être ouvert à des personnes nommément.',

  personnes_titre: 'Personnes',
  proprietaire: 'propriétaire',
  groupes_de: 'Groupes',
  cours_de: 'Cours',
  appareils_connectes: 'Appareils connectés',
  aucun: 'aucun',
  lien_secours: 'Lien de secours',
  lien_secours_pret:
    'Lien de secours pour cette personne : valable 24 heures, une seule utilisation. Il lui ajoute une passkey et ouvre sa session.',
  deconnecter_appareils: 'Déconnecter ses appareils',
  passkeys_titre: 'Passkeys',
  aucune_passkey: 'Aucune passkey',
  supprimer_compte: 'Supprimer le compte',
  supprimer_compte_confirmer: 'Confirmer : tout son compte est effacé',

  inviter_titre: 'Inviter quelqu’un',
  inviter_aide:
    'Le lien est valable 7 jours et ne sert qu’une fois. Les groupes et les cours cochés sont appliqués à la création du compte ; les cours sont ouverts à la personne elle-même, pas à un groupe.',
  inviter_groupes: 'Entrer dans les groupes',
  inviter_cours: 'Ouvrir les cours',
  inviter_creer: 'Créer une invitation',
  inviter_prete: 'Invitation prête. Le lien n’est affiché qu’une fois : envoie-le maintenant.',

  groupes_titre: 'Groupes',
  groupe_nom: 'Nom du groupe',
  groupe_creer: 'Créer le groupe',
  groupe_aucun: 'Aucun groupe.',
  groupe_sans_membre: 'Aucun membre.',
  membre_choisir: 'Ajouter une personne…',
  membre_ajouter: 'Ajouter',
  retirer: 'Retirer',

  droits_titre: 'Droits sur les cours',
  droits_aide:
    'Un droit ouvre un cours à une personne ou à un groupe. Le propriétaire a accès à tous les cours. Un cours qui contient des éléments « à vérifier » ne s’ouvre qu’à des personnes nommément, pas à un groupe, sauf dérogation écrite dans son cours.yaml. Un droit de groupe déjà donné reste suspendu tant que le cours contient de tels éléments sans dérogation.',
  droit_cours: 'Cours',
  droit_sujet: 'Ouvrir à',
  droit_choisir: 'Choisir…',
  droit_personnes: 'Personnes',
  droit_groupes: 'Groupes',
  droit_ouvrir: 'Ouvrir le cours',
  droit_aucun: 'Aucun droit accordé.',
  cours_retire: 'cours retiré',
  sujet_inconnu: 'inconnu',
  sujet_personne: 'personne',
  sujet_groupe: 'groupe',
} as const;

export type CleTexteAdmin = keyof typeof textesAdmin;

/**
 * La langue d'un téléphone (`navigator.language`) parmi celles de l'interface : l'allemand s'il
 * commence par `de`, le français sinon (décision 2). Sans argument, celle du navigateur courant.
 */
export function langueDuNavigateur(
  langueDuTelephone: string | undefined = globalThis.navigator?.language,
): Langue {
  return /^de(?:[-_]|$)/i.test(langueDuTelephone ?? '') ? 'de' : 'fr';
}
