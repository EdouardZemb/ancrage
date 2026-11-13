/*
 * Le gabarit de la notice (1e-D15, S1-D7) : sa structure, ses libellés et son orthographe, sur le
 * gabarit composé avec les valeurs factices de l'exemple. Les valeurs de l'instance réelle sont
 * tenues par l'instantané `notice.json` (S1-D10), pas ici.
 */
import { describe, expect, it } from 'vitest';
import { LANGUES, type Langue, textes } from '../client/textes.js';
import { valeursDeNoticeDExemple } from './contenu/exemple.fixture.js';
import { CLES_DE_NOTICE, type Notice } from './notice.js';
import { GABARIT_DE_NOTICE, NOTICE_VERSION, noticeComposee } from './notice-gabarit.js';

const VALEURS = valeursDeNoticeDExemple();

/** Chaque texte d'une notice, titres compris, dans l'ordre. */
function morceauxDe(notice: Notice): string[] {
  const { titre, introduction, sections } = notice;
  return [
    titre,
    introduction,
    ...sections.flatMap((section) => [
      section.titre,
      ...(section.paragraphes ?? []),
      ...(section.liste ?? []),
    ]),
  ];
}

/** Chaque texte de la notice composée avec les valeurs de l'exemple. */
function morceaux(langue: Langue): string[] {
  return morceauxDe(noticeComposee(langue, VALEURS));
}

/** Tout le texte de la notice composée dans une langue, d'un seul tenant. */
function texteEntier(langue: Langue): string {
  return morceaux(langue).join('\n');
}

describe('notice', () => {
  it('gabarit_porte_exactement_les_cles', () => {
    // Chaque clé de l'instance a son trou dans chaque langue, et il n'y en a pas d'autre.
    for (const langue of LANGUES) {
      const trous = new Set(
        morceauxDe(GABARIT_DE_NOTICE[langue]).flatMap((texte) =>
          [...texte.matchAll(/\{([^{}]+)\}/g)].map(([, cle]) => cle),
        ),
      );
      expect([...trous].sort(), langue).toEqual([...CLES_DE_NOTICE].sort());
    }
  });

  it('notice_memes_sections_dans_les_deux_langues', () => {
    // L'allemand est la traduction fidèle du français (1e-D15) : même découpage, rien de vide.
    const de = noticeComposee('de', VALEURS);
    const fr = noticeComposee('fr', VALEURS);
    expect(de.sections).toHaveLength(fr.sections.length);
    fr.sections.forEach((section, i) => {
      const traduite = de.sections[i];
      expect(traduite?.paragraphes?.length, section.titre).toBe(section.paragraphes?.length);
      expect(traduite?.liste?.length, section.titre).toBe(section.liste?.length);
    });
    for (const langue of LANGUES) {
      for (const texte of morceaux(langue)) {
        expect(texte.trim(), langue).not.toBe('');
      }
      // Une section a au moins un paragraphe ou une liste, et aucun tableau vide.
      for (const section of noticeComposee(langue, VALEURS).sections) {
        const paragraphes = section.paragraphes?.length;
        const elements = section.liste?.length;
        expect((paragraphes ?? 0) + (elements ?? 0), section.titre).toBeGreaterThan(0);
        expect(paragraphes, section.titre).not.toBe(0);
        expect(elements, section.titre).not.toBe(0);
      }
    }
  });

  it('notice_nomme_les_tiers_et_le_pays', () => {
    // Les tiers, le pays et les autorités viennent des valeurs de l'instance ; les durées, que le
    // code ou la chaîne fixent, restent dans le gabarit.
    for (const langue of LANGUES) {
      const texte = texteEntier(langue);
      for (const cle of CLES_DE_NOTICE) {
        expect(texte, `${langue} : ${cle}`).toContain(VALEURS.valeurs[langue][cle]);
      }
    }
    for (const mot of ['Exemplie', 'Passerelle', 'Coffre', '90 jours', '180 jours', '100 jours']) {
      expect(texteEntier('fr'), mot).toContain(mot);
    }
    for (const mot of ['Exemplien', 'Passerelle', 'Coffre', '90 Tage', '180 Tage', '100 Tage']) {
      expect(texteEntier('de'), mot).toContain(mot);
    }
    // Le fragment d'un trou prend place dans sa phrase.
    expect(texteEntier('fr')).toContain('90 jours chez Coffre, tant que');
    expect(texteEntier('fr')).toContain('il répond dans les 15 jours.');
    expect(texteEntier('de')).toContain('Er antwortet innert 15 Tagen.');
    expect(texteEntier('de')).toContain('mit Passerelle kann die Adresse');
  });

  it('notice_cite_les_libelles_reels_de_l_interface', () => {
    // La notice nomme ce que la personne voit (1e-R1) : le lien « Compte » de l'en-tête, l'export
    // et la suppression, avec les guillemets de chaque langue.
    const cites: Record<Langue, (libelle: string) => string> = {
      fr: (libelle) => `« ${libelle} »`,
      de: (libelle) => `«${libelle}»`,
    };
    for (const langue of LANGUES) {
      const texte = texteEntier(langue);
      const t = textes[langue];
      for (const libelle of [t.compte_lien, t.export_lien, t.suppression_bouton]) {
        expect(texte, `${langue} : ${libelle}`).toContain(cites[langue](libelle));
      }
    }
    expect(texteEntier('fr')).not.toContain('Mon compte »');
  });

  it('notice_dit_exactement_ce_qui_est_garde', () => {
    // 1e-R16, 1e-R17 : tout le résultat d'un examen, le code de l'appareil qui reste après la
    // déconnexion, le User-Agent dont seul le type d'appareil est tiré, et ce qui est nécessaire
    // au service (RGPD, art. 13, par. 2, let. e).
    const attendus: Record<Langue, string[]> = {
      fr: [
        'le nombre de questions',
        'le nombre de chapitres',
        'User-Agent',
        'le code tiré au hasard sur ton appareil, qui ne dit rien de toi',
        'nécessaires au service',
        // ADR-0013 : le mode de chaque réponse, les statistiques d'ensemble, le suivi avec accord.
        'la manière dont tu as répondu',
        'jamais ce que tu as répondu',
        'statistiques d’ensemble',
        'Si tu es d’accord, le responsable suit aussi ta progression',
        'sans ton accord, il n’en voit que les chiffres d’ensemble',
      ],
      de: [
        'die Zahl der Fragen',
        'die Zahl der Kapitel',
        'User-Agent',
        'dem zufällig erzeugten Code deines Geräts, der nichts über dich verrät',
        'für den Dienst nötig',
        'die Art, wie du geantwortet hast',
        'nie, was du geantwortet hast',
        'Gesamtstatistiken',
        'Wenn du einverstanden bist, verfolgt der Verantwortliche auch deinen Lernfortschritt',
        'ohne dein Einverständnis sieht er nur die Gesamtzahlen',
      ],
    };
    for (const langue of LANGUES) {
      for (const attendu of attendus[langue]) {
        expect(texteEntier(langue), `${langue} : ${attendu}`).toContain(attendu);
      }
    }
    // L'ancienne formule laissait croire qu'aucun identifiant ne venait de l'appareil.
    expect(texteEntier('fr')).not.toContain('l’identifiant de ton navigateur');
    expect(texteEntier('de')).not.toContain('Kennung deines Browsers');
  });

  it('notice_porte_la_version_de_son_dernier_changement', () => {
    // Le texte change avec ADR-0013 (le suivi avec accord) : la version est celle de ce changement.
    expect(NOTICE_VERSION).toBe('2026-11-13');
  });

  it('notice_dit_les_limites_de_ce_qu_elle_promet', () => {
    // Revue finale du lot 1e (I2, I3) : l'adresse IP, gardée en mémoire par la limite de débit. Depuis
    // 1f-D9, le magasin d'ancrage l'oublie à la fin de sa fenêtre (`magasin-debit.ts`) ; 1f-D2
    // reportait la phrase ici, qui le dit maintenant ; les sauvegardes, dont la rétention suppose
    // qu'elles réussissent ; le rejeu du registre, son exception, et son second usage (lot 2d : il
    // sert à vider les autres appareils) ; les autres appareils, vidés à leur prochain contact avec
    // le serveur, dans les 100 jours ; la passkey qui peut rester sur le téléphone, et le code de
    // l'appareil qui reste après la suppression ; ce que l'export ne contient pas.
    const attendus: Record<Langue, string[]> = {
      fr: [
        'Ton adresse IP n’est jamais enregistrée',
        'en mémoire, pour limiter les tentatives de connexion, et l’oublie au plus tard une minute après ta dernière tentative',
        'tant que la sauvegarde de chaque nuit réussit',
        'ils servent aussi à faire vider tes autres appareils',
        'Seule exception',
        'à la main',
        'se vident de même la prochaine fois qu’ils joignent le serveur, s’ils le font dans les 100 jours',
        'seul ce code reste',
        'sur chaque appareil qu’elle vide',
        'Un compte supprimé y reste donc 90 jours environ',
        'Deux choses n’y sont pas : l’empreinte du jeton de chaque session',
      ],
      de: [
        'Deine IP-Adresse wird nirgends aufgezeichnet',
        'nur im Arbeitsspeicher, um Anmeldeversuche zu begrenzen, und vergisst sie spätestens eine Minute nach deinem letzten Anmeldeversuch',
        'solange die nächtliche Sicherung gelingt',
        'sie dienen auch dazu, deine anderen Geräte leeren zu lassen',
        'Einzige Ausnahme',
        'von Hand',
        'leeren sich ebenso, sobald sie das nächste Mal den Server erreichen',
        'Nur dieser Code bleibt',
        'auf jedem Gerät, das sie leert',
        'Ein gelöschtes Konto bleibt darin also etwa 90 Tage',
        'Zwei Dinge sind nicht darin: der Fingerabdruck des Tokens jeder Sitzung',
      ],
    };
    for (const langue of LANGUES) {
      for (const attendu of attendus[langue]) {
        expect(texteEntier(langue), `${langue} : ${attendu}`).toContain(attendu);
      }
    }
    // Les anciennes formules : l'adresse IP gardée jusqu'au redémarrage, les autres appareils qui
    // gardent leur copie jusqu'à une déconnexion à la main ; l'adresse IP parmi ce qui n'est « jamais »
    // gardé ; le rejeu promis sans exception.
    expect(texteEntier('fr')).not.toContain('au plus tard à son redémarrage');
    expect(texteEntier('de')).not.toContain('bei seinem Neustart');
    expect(texteEntier('fr')).not.toContain('déconnecte-toi d’abord sur chacun d’eux');
    expect(texteEntier('de')).not.toContain('Melde dich zuerst auf jedem von ihnen ab');
    expect(texteEntier('fr')).not.toContain('ton vrai nom, ton adresse IP');
    expect(texteEntier('de')).not.toContain('dein echter Name, deine IP-Adresse');
    expect(texteEntier('fr')).not.toContain('aussitôt effacés de nouveau');
    expect(texteEntier('de')).not.toContain('sofort wieder gelöscht');
  });

  it('notice_version_est_une_date_affichee_dans_l_introduction', () => {
    expect(NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${NOTICE_VERSION}T00:00:00Z`).toISOString().slice(0, 10)).toBe(NOTICE_VERSION);
    // La date des valeurs de l'exemple est celle du gabarit : c'est elle qui s'affiche.
    const [annee, mois, jour] = NOTICE_VERSION.split('-');
    expect(noticeComposee('fr', VALEURS).introduction).toMatch(
      new RegExp(` Version du ${jour}/${mois}/${annee}\\.$`),
    );
    expect(noticeComposee('de', VALEURS).introduction).toMatch(
      new RegExp(` Version vom ${jour}\\.${mois}\\.${annee}\\.$`),
    );
    // Des valeurs changées plus tard que le gabarit : leur date s'affiche.
    const plusTard = { ...VALEURS, date: '2099-12-31' };
    expect(noticeComposee('fr', plusTard).introduction).toMatch(/ Version du 31\/12\/2099\.$/);
    expect(noticeComposee('de', plusTard).introduction).toMatch(/ Version vom 31\.12\.2099\.$/);
  });

  it('notice_liens_presents_dans_les_deux_langues', () => {
    // Chaque adresse rendue cliquable figure dans les deux textes ; les sites sont en https.
    expect(VALEURS.liens.length).toBeGreaterThan(0);
    for (const { texte, cible } of VALEURS.liens) {
      for (const langue of LANGUES) {
        expect(texteEntier(langue), `${langue} : ${texte}`).toContain(texte);
      }
      expect(cible).toMatch(/^(?:https:\/\/|mailto:)/);
    }
  });

  it('notice_allemand_en_orthographe_suisse_et_francais_au_tutoiement', () => {
    expect(morceauxDe(GABARIT_DE_NOTICE.de).join('\n')).not.toContain('ß');
    expect(morceauxDe(GABARIT_DE_NOTICE.fr).join('\n')).not.toMatch(/\b(?:vous|votre|vos)\b/i);
    expect(texteEntier('de')).not.toContain('ß');
    expect(texteEntier('fr')).not.toMatch(/\b(?:vous|votre|vos)\b/i);
  });
});
