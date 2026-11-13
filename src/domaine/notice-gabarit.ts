/*
 * Le gabarit de la notice de confidentialité (ADR-0007 §3, ADR-0009, 1e-D15, S1-D7) : ce qu'ancrage
 * garde sur une personne, pourquoi, où, combien de temps, et comment exercer ses droits. Le texte
 * français fait foi ; l'allemand en est la traduction fidèle, au tutoiement, en orthographe suisse.
 * Les écrans qu'elle cite portent les libellés réels de `textes.ts` (1e-R1).
 *
 * Ce qui est propre à une instance (son responsable, ses tiers, ses pays, ses autorités) n'est pas
 * écrit ici : ce sont des trous `{cle}` (`CLES_DE_NOTICE`), que les valeurs du `notice.yaml` de son
 * contenu remplissent. Les durées qui restent écrites sont des constantes du code ou de la chaîne
 * de déploiement, que l'instance ne règle pas.
 *
 * Le texte est versionné avec le code : `NOTICE_VERSION` est la date de fusion de la PR qui le
 * change (1e-D15). Collecter une donnée de plus, changer de tiers ou de pays, ou écrire une donnée
 * personnelle dans le journal de l'application oblige à modifier le gabarit ou les valeurs, et à
 * prévenir les personnes (ADR-0007 et ADR-0009, « Difficile à changer »).
 *
 * Le client et la CLI de contenu l'importent tous deux : il ne dépend jamais du client (S1-D7).
 */
import { composerNotice, dateAffichee, type Notice, type ValeursDeNotice } from './notice.js';

/** La version du gabarit : la date de fusion de la PR qui l'a changé, `AAAA-MM-JJ`. */
export const NOTICE_VERSION = '2026-11-13';

/** Les langues de la notice, celles de l'interface. */
export type LangueDeNotice = keyof ValeursDeNotice['valeurs'];

/** La phrase qui clôt l'introduction : `AAAA-MM-JJ` y devient `JJ/MM/AAAA` ou `JJ.MM.AAAA`. */
const PHRASE_DE_VERSION: Record<LangueDeNotice, (date: string) => string> = {
  fr: (date) => `Version du ${date.split('-').reverse().join('/')}.`,
  de: (date) => `Version vom ${date.split('-').reverse().join('.')}.`,
};

const fr: Notice = {
  titre: 'Confidentialité',
  introduction:
    'ancrage est une application de révision. Cette page dit quelles données elle garde sur toi, pourquoi, où, combien de temps, et comment exercer tes droits.',
  sections: [
    {
      titre: 'Qui est responsable ?',
      paragraphes: ['{responsable}'],
    },
    {
      titre: 'Pourquoi ?',
      paragraphes: [
        'Pour te faire réviser tes cours : te reconnaître quand tu te connectes, n’ouvrir que les cours auxquels tu as droit, et garder ta progression sur tous tes appareils. Rien d’autre : ni publicité, ni mesure d’audience, ni revente. La base légale est l’exécution du service que tu demandes en créant ton compte (art. 6, par. 1, let. b du RGPD).',
        'Tes réponses servent aussi à des statistiques d’ensemble, pour régler l’application (par exemple le moment où une carte revient). Si tu es d’accord, le responsable suit aussi ta progression ; sans ton accord, il n’en voit que les chiffres d’ensemble.',
      ],
    },
    {
      titre: 'Quelles données ?',
      liste: [
        'ton nom affiché (un pseudonyme suffit), la langue de l’interface et la date de création de ton compte ;',
        'pour chaque passkey : sa clé publique, son compteur, ses modes de connexion, le type d’appareil et ses dates ;',
        'pour chaque session : une empreinte de son jeton, le type d’appareil et ses dates ;',
        'tes groupes et tes droits sur les cours ;',
        'ton journal de réponses : pour chaque réponse, l’élément du cours, le résultat (juste ou faux ; pour un examen, les points, le nombre de questions, la note, la durée et le nombre de chapitres), la manière dont tu as répondu (carte retournée, texte tapé, choix parmi des propositions, tuiles assemblées, point touché, réponse montrée, bilan d’un texte : jamais ce que tu as répondu), l’heure, et un code tiré au hasard sur ton appareil, qui distingue tes appareils sans rien dire d’eux.',
      ],
      paragraphes: [
        'Jamais : ton adresse e-mail, ton numéro de téléphone, ton vrai nom, la signature de ton navigateur (User-Agent), dont seul le type d’appareil est tiré, ni le texte que tu tapes. Ton adresse IP n’est jamais enregistrée : le serveur la garde seulement en mémoire, pour limiter les tentatives de connexion, et l’oublie au plus tard une minute après ta dernière tentative.',
        'Les données de la liste ci-dessus sont nécessaires au service : sans nom affiché ni passkey, aucun compte ne peut être créé ; sans tes réponses, aucune progression ne peut être gardée.',
      ],
    },
    {
      titre: 'Où sont-elles, et qui les voit ?',
      liste: [
        '{lieu_du_serveur}',
        '{tiers_tunnel}',
        '{tiers_sauvegardes}',
        '{transferts}',
        '{qui_ne_voit_pas}',
      ],
    },
    {
      titre: 'Combien de temps ?',
      liste: [
        'ton compte, ta progression et tes passkeys : jusqu’à ce que tu supprimes ton compte, ou que le responsable le supprime ;',
        'une session : 180 jours après sa dernière utilisation, puis elle est effacée ;',
        'un lien d’invitation ou de connexion : effacé peu après avoir servi ou expiré (une invitation expire après 7 jours, un lien de connexion après 24 heures) ;',
        'les sauvegardes : 30 jours sur le serveur, 90 jours {sauvegarde_distante}, tant que la sauvegarde de chaque nuit réussit (si elle échoue, les plus anciennes ne sont effacées qu’à la suivante qui réussit). Un compte supprimé y reste donc 90 jours environ. Si une sauvegarde devait être restaurée, les comptes supprimés depuis seraient effacés de nouveau : pour cela, l’identifiant aléatoire d’un compte supprimé et la date de sa suppression sont gardés 100 jours ; ils servent aussi à faire vider tes autres appareils (voir « Sur ton téléphone »). Seule exception : si la base du serveur elle-même était perdue ou illisible, cette liste le serait aussi, et le responsable effacerait de nouveau à la main les comptes qu’il sait supprimés ;',
        'les journaux techniques : celui de l’application ne contient aucune donnée personnelle ; celui de la liaison avec {tunnel} peut garder l’adresse d’une page demandée qui n’a pas atteint l’application (pendant un redémarrage, par exemple), mais, à notre connaissance, pas ton adresse IP. Les deux sont plafonnés en taille, pas en durée : les lignes les plus anciennes s’effacent quand le plafond est atteint. {tunnel} garde ses propres journaux, selon ses règles.',
      ],
    },
    {
      titre: 'Sur ton téléphone',
      paragraphes: [
        'Pour fonctionner hors ligne, l’application garde dans ton navigateur une copie de tes cours, de ta progression et des réponses pas encore envoyées. Tout est effacé à la déconnexion, sauf les réponses qui n’ont pas pu partir et le code tiré au hasard sur ton appareil, qui ne dit rien de toi.',
        'Quand tu supprimes ton compte, cet appareil est vidé lui aussi, réponses en attente comprises : seul ce code reste. Tes autres appareils se vident de même la prochaine fois qu’ils joignent le serveur, s’ils le font dans les 100 jours ; au-delà, ils gardent leur copie jusqu’à ce que tu t’y déconnectes. Il en va de même quand c’est le responsable qui supprime ton compte.',
        'Ta passkey est gardée par ton téléphone (par exemple dans le gestionnaire de mots de passe de Google), avec ton nom affiché. Quand ton compte est supprimé, l’application demande au navigateur de la retirer, sur chaque appareil qu’elle vide, mais tous les navigateurs ne le font pas : si elle y est encore, supprime-la toi-même dans ce gestionnaire.',
      ],
    },
    {
      titre: 'Tes droits',
      liste: [
        'voir et emporter tes données : « Compte » (en haut de l’écran), puis « Télécharger mes données » (un fichier JSON). Deux choses n’y sont pas : l’empreinte du jeton de chaque session, qui ne sert qu’à la sécurité, et la progression d’un cours qui ne t’est plus ouvert. Celle-ci reste gardée : écris au responsable pour l’obtenir ;',
        'corriger ton nom affiché : « Compte » ;',
        'effacer ton compte : « Compte », puis « Supprimer mon compte ». L’effacement est immédiat et définitif ; tes autres appareils se vident à leur prochain contact avec le serveur (voir « Sur ton téléphone ») ;',
        'pour toute autre demande (une question, une limitation, une opposition), écris au responsable : il répond dans les {delai_reponse}.',
      ],
      paragraphes: [
        'Si tu estimes que tes droits ne sont pas respectés, tu peux te plaindre {autorites}.',
      ],
    },
  ],
};

const de: Notice = {
  titre: 'Datenschutz',
  introduction:
    'ancrage ist eine App zum Wiederholen deiner Kurse. Diese Seite sagt dir, welche Daten sie über dich speichert, wozu, wo, wie lange und wie du deine Rechte ausüben kannst.',
  sections: [
    {
      titre: 'Wer ist verantwortlich?',
      paragraphes: ['{responsable}'],
    },
    {
      titre: 'Wozu?',
      paragraphes: [
        'Damit du deine Kurse wiederholen kannst: um dich bei der Anmeldung zu erkennen, dir nur die Kurse zu öffnen, für die du berechtigt bist, und deinen Lernfortschritt auf allen deinen Geräten zu behalten. Für nichts anderes: keine Werbung, keine Reichweitenmessung, kein Weiterverkauf. Die Rechtsgrundlage ist die Erbringung des Dienstes, den du mit der Erstellung deines Kontos verlangst (Art. 6 Abs. 1 lit. b DSGVO).',
        'Deine Antworten dienen auch Gesamtstatistiken, um die Anwendung einzustellen (zum Beispiel, wann eine Karte wiederkommt). Wenn du einverstanden bist, verfolgt der Verantwortliche auch deinen Lernfortschritt; ohne dein Einverständnis sieht er nur die Gesamtzahlen.',
      ],
    },
    {
      titre: 'Welche Daten?',
      liste: [
        'dein Anzeigename (ein Pseudonym genügt), die Sprache der Oberfläche und das Erstellungsdatum deines Kontos;',
        'für jeden Passkey: sein öffentlicher Schlüssel, sein Zähler, seine Verbindungsarten, der Gerätetyp und wann er erstellt und zuletzt benutzt wurde;',
        'für jede Sitzung: ein Fingerabdruck ihres Tokens, der Gerätetyp und wann sie begonnen hat, zuletzt benutzt wurde und abläuft;',
        'deine Gruppen und deine Berechtigungen für die Kurse;',
        'das Protokoll deiner Antworten: für jede Antwort das Element des Kurses, das Ergebnis (richtig oder falsch; bei einer Probeprüfung die Punkte, die Zahl der Fragen, die Note, die Dauer und die Zahl der Kapitel), die Art, wie du geantwortet hast (Karte umgedreht, Text getippt, Auswahl unter Vorschlägen, Kacheln zusammengesetzt, angetippter Punkt, gezeigte Antwort, Auswertung eines Textes: nie, was du geantwortet hast), die Uhrzeit und ein auf deinem Gerät zufällig erzeugter Code, der deine Geräte unterscheidet, ohne etwas über sie zu verraten.',
      ],
      paragraphes: [
        'Niemals: deine E-Mail-Adresse, deine Telefonnummer, dein echter Name, die Signatur deines Browsers (User-Agent), aus der nur der Gerätetyp abgeleitet wird, oder der Text, den du eintippst. Deine IP-Adresse wird nirgends aufgezeichnet: Der Server hält sie nur im Arbeitsspeicher, um Anmeldeversuche zu begrenzen, und vergisst sie spätestens eine Minute nach deinem letzten Anmeldeversuch.',
        'Die Daten der Liste oben sind für den Dienst nötig: Ohne Anzeigenamen und Passkey kann kein Konto erstellt werden; ohne deine Antworten kann kein Lernfortschritt gespeichert werden.',
      ],
    },
    {
      titre: 'Wo sind sie und wer sieht sie?',
      liste: [
        '{lieu_du_serveur}',
        '{tiers_tunnel}',
        '{tiers_sauvegardes}',
        '{transferts}',
        '{qui_ne_voit_pas}',
      ],
    },
    {
      titre: 'Wie lange?',
      liste: [
        'dein Konto, dein Lernfortschritt und deine Passkeys: bis du dein Konto löschst oder der Verantwortliche es löscht;',
        'eine Sitzung: 180 Tage nach ihrer letzten Nutzung, dann wird sie gelöscht;',
        'ein Einladungs- oder Anmeldelink: kurz nach seiner Verwendung oder seinem Ablauf gelöscht (eine Einladung läuft nach 7 Tagen ab, ein Anmeldelink nach 24 Stunden);',
        'die Sicherungskopien: 30 Tage auf dem Server, 90 Tage {sauvegarde_distante}, solange die nächtliche Sicherung gelingt (schlägt sie fehl, werden die ältesten erst bei der nächsten gelungenen gelöscht). Ein gelöschtes Konto bleibt darin also etwa 90 Tage. Müsste eine Sicherungskopie wiederhergestellt werden, würden die seither gelöschten Konten wieder gelöscht: Dafür werden die zufällige Kennung eines gelöschten Kontos und das Datum seiner Löschung 100 Tage aufbewahrt; sie dienen auch dazu, deine anderen Geräte leeren zu lassen (siehe «Auf deinem Handy»). Einzige Ausnahme: Wäre die Datenbank des Servers selbst verloren oder unlesbar, wäre auch diese Liste verloren, und der Verantwortliche würde die Konten, von denen er weiss, dass sie gelöscht wurden, von Hand wieder löschen;',
        'die technischen Protokolle: Das Protokoll der App enthält keine Personendaten; das Protokoll der Verbindung mit {tunnel} kann die Adresse einer aufgerufenen Seite speichern, die nicht bis zur App gelangt ist (zum Beispiel während eines Neustarts), aber unseres Wissens nicht deine IP-Adresse. Beide sind in der Grösse begrenzt, nicht in der Dauer: Die ältesten Einträge werden gelöscht, wenn die Grenze erreicht ist. {tunnel} bewahrt seine eigenen Protokolle nach seinen eigenen Regeln auf.',
      ],
    },
    {
      titre: 'Auf deinem Handy',
      paragraphes: [
        'Damit die App auch offline funktioniert, speichert sie in deinem Browser eine Kopie deiner Kurse, deines Lernfortschritts und der noch nicht gesendeten Antworten. Beim Abmelden wird alles gelöscht, ausser den Antworten, die nicht gesendet werden konnten, und dem zufällig erzeugten Code deines Geräts, der nichts über dich verrät.',
        'Wenn du dein Konto löschst, wird auch dieses Gerät geleert, samt den wartenden Antworten: Nur dieser Code bleibt. Deine anderen Geräte leeren sich ebenso, sobald sie das nächste Mal den Server erreichen, sofern das innert 100 Tagen geschieht. Erreichen sie ihn erst später, behalten sie ihre Kopie, bis du dich dort abmeldest. Dasselbe gilt, wenn der Verantwortliche dein Konto löscht.',
        'Dein Passkey wird von deinem Handy aufbewahrt (zum Beispiel im Passwortmanager von Google), zusammen mit deinem Anzeigenamen. Wenn dein Konto gelöscht wird, bittet die App den Browser auf jedem Gerät, das sie leert, den Passkey zu entfernen, aber nicht jeder Browser tut das: Ist er noch da, lösche ihn selbst in diesem Passwortmanager.',
      ],
    },
    {
      titre: 'Deine Rechte',
      liste: [
        'deine Daten einsehen und mitnehmen: «Konto» (oben auf dem Bildschirm), dann «Meine Daten herunterladen» (eine JSON-Datei). Zwei Dinge sind nicht darin: der Fingerabdruck des Tokens jeder Sitzung, der nur der Sicherheit dient, und der Lernfortschritt eines Kurses, der für dich nicht mehr freigegeben ist. Dieser bleibt aber gespeichert: Schreib dem Verantwortlichen, um ihn zu erhalten;',
        'deinen Anzeigenamen berichtigen: «Konto»;',
        'dein Konto löschen: «Konto», dann «Mein Konto löschen». Die Löschung erfolgt sofort und endgültig; deine anderen Geräte leeren sich, sobald sie das nächste Mal den Server erreichen (siehe «Auf deinem Handy»);',
        'für jedes andere Anliegen (eine Frage, eine Einschränkung, ein Widerspruch) schreib dem Verantwortlichen: Er antwortet innert {delai_reponse}.',
      ],
      paragraphes: [
        'Wenn du findest, dass deine Rechte nicht eingehalten werden, kannst du dich {autorites} beschweren.',
      ],
    },
  ],
};

/** Le gabarit dans chaque langue de l'interface. */
export const GABARIT_DE_NOTICE: Record<LangueDeNotice, Notice> = { de, fr };

/**
 * La notice affichée dans `langue` : le gabarit, rempli des valeurs de l'instance
 * (`composerNotice`), et son introduction close par la date affichée, la plus récente de
 * `NOTICE_VERSION` et de la date des valeurs (S1-D7).
 */
export function noticeComposee(langue: LangueDeNotice, notice: ValeursDeNotice): Notice {
  const composee = composerNotice(GABARIT_DE_NOTICE[langue], notice.valeurs[langue]);
  const date = dateAffichee(NOTICE_VERSION, notice.date);
  return {
    ...composee,
    introduction: `${composee.introduction} ${PHRASE_DE_VERSION[langue](date)}`,
  };
}
