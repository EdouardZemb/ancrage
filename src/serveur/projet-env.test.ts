import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executer } from './cli.js';
import { DOSSIER_EXEMPLE } from './contenus/exemple.disque.fixture.js';

// `deploiement/projet.env` est semé par le modèle, puis appartient à ancrage : la mécanique du modèle
// (gérée, hors de ce dépôt) y lit les commandes de l'image. Ce test tient les deux clés du report
// (REPORTER, REPORTER_SECTION) et le titre du runbook auquel les messages de restaurer.sh renvoient,
// puis VERIFIER_CONTENU, la commande du contenu monté sur /contenu (S1-D4).
const RACINE = path.resolve(import.meta.dirname, '../..');
const PROJET_ENV = path.join(RACINE, 'deploiement', 'projet.env');
const EXPLOITATION = path.join(RACINE, 'docs', 'exploitation.md');
const CLI = ['node', 'dist/serveur/cli.js'];

/** Les réglages, lus comme la mécanique les lit : `CLE=mots`, sans commentaire ni ligne vide. */
function lireProjetEnv(): Map<string, string[]> {
  const reglages = new Map<string, string[]>();
  for (const ligne of fs.readFileSync(PROJET_ENV, 'utf8').split('\n')) {
    if (ligne === '' || ligne.startsWith('#')) {
      continue;
    }
    const egal = ligne.indexOf('=');
    expect(egal, `ligne sans « = » : ${ligne}`).toBeGreaterThan(0);
    const cle = ligne.slice(0, egal);
    expect(cle).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(reglages.has(cle), `${cle} déclarée deux fois`).toBe(false);
    reglages.set(
      cle,
      ligne
        .slice(egal + 1)
        .split(' ')
        .filter(Boolean),
    );
  }
  return reglages;
}

describe('deploiement/projet.env', () => {
  it('declare_le_report_du_registre', () => {
    const reglages = lireProjetEnv();

    expect(reglages.get('REPORTER')).toEqual([...CLI, 'rejouer-suppressions', '--dossiers']);
    expect(reglages.get('REPORTER_SECTION')?.length ?? 0).toBeGreaterThan(0);
  });

  it('reporter_section_est_un_titre_de_l_exploitation', () => {
    // La mécanique rejoint les mots par une espace : c'est ce titre-là que ses messages citent.
    const titre = (lireProjetEnv().get('REPORTER_SECTION') ?? []).join(' ');
    const titres = fs
      .readFileSync(EXPLOITATION, 'utf8')
      .split('\n')
      .flatMap((ligne) => /^#{1,6} (.+)$/.exec(ligne)?.[1]?.trim() ?? []);

    expect(titre).not.toBe('');
    expect(titres).toContain(titre);
  });

  it('reporter_est_une_commande_que_la_cli_connait', async () => {
    // Une commande inconnue rendrait 64 : chaque restauration s'arrêterait sur « l'image déployée ne
    // connaît pas la commande REPORTER ». Deux dossiers vides : la CLI refuse (1), sans usage.
    const mots = lireProjetEnv().get('REPORTER') ?? [];
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-reporter-'));
    try {
      const [actuel, donnees] = ['actuel', 'donnees'].map((nom) => path.join(dossier, nom));
      const lignes: string[] = [];

      const code = await executer([...mots.slice(CLI.length), actuel ?? '', donnees ?? ''], (l) =>
        lignes.push(l),
      );

      expect(mots.slice(0, CLI.length)).toEqual(CLI);
      expect(code).toBe(1);
      expect(lignes.join('\n')).not.toContain('usage');
    } finally {
      fs.rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('declare_la_verification_du_contenu', () => {
    // La règle des paires du modèle : le dossier du contenu de l'instance exige VERIFIER_CONTENU,
    // et l'inverse. Sans elle, le déploiement refuserait le premier couple avec un commit de
    // données.
    expect(lireProjetEnv().get('VERIFIER_CONTENU')).toEqual([...CLI, 'verifier-contenu']);
  });

  it('verifier_contenu_accepte_l_exemple_de_l_image', async () => {
    // verifier-image.sh la lance sur exemple-contenu/, que l'image embarque : une commande inconnue
    // rendrait 64, un exemple non conforme 2, et l'image ne serait jamais publiée.
    const mots = lireProjetEnv().get('VERIFIER_CONTENU') ?? [];
    const lignes: string[] = [];

    const code = await executer([...mots.slice(CLI.length), DOSSIER_EXEMPLE], (l) =>
      lignes.push(l),
    );

    expect(mots.slice(0, CLI.length)).toEqual(CLI);
    expect(lignes).toEqual(['contenu conforme : 1 cours']);
    expect(code).toBe(0);
  });
});
