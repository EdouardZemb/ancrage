import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Le `Dockerfile` pose le dossier que le serveur sert (S1-D3, S1-D12). Aucune vérification de la CI
// ne tient cette valeur : verifier-image.sh passe `/contenu` en argument à VERIFIER_CONTENU, et le
// test de bout en bout tourne sans contenu monté. Une valeur fausse passerait donc toute la CI, et
// le staging servirait l'exemple sans bruit. Ce test la lie au point de montage de
// `deploiement/compose.contenu.yml`, géré par le modèle et seulement lu ici.
const RACINE = path.resolve(import.meta.dirname, '../..');
const DOCKERFILE = path.join(RACINE, 'Dockerfile');
const COMPOSE_CONTENU = path.join(RACINE, 'deploiement', 'compose.contenu.yml');

/** Les instructions de l'étape finale du `Dockerfile`, une par ligne, continuations jointes. */
function etapeFinale(): string[] {
  const instructions = fs
    .readFileSync(DOCKERFILE, 'utf8')
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith('#'));
  const debut = instructions.findLastIndex((instruction) => /^FROM\s/.test(instruction));
  expect(debut).toBeGreaterThanOrEqual(0);
  return instructions.slice(debut);
}

/** Les variables que l'étape finale pose par ses `ENV CLE=valeur`. */
function variablesDeLImage(): Map<string, string> {
  const variables = new Map<string, string>();
  for (const instruction of etapeFinale()) {
    if (!instruction.startsWith('ENV ')) continue;
    for (const mot of instruction.slice('ENV '.length).trim().split(/\s+/)) {
      const egal = mot.indexOf('=');
      expect(egal, `ENV sans « = » : ${mot}`).toBeGreaterThan(0);
      variables.set(mot.slice(0, egal), mot.slice(egal + 1));
    }
  }
  return variables;
}

/** Les montages du service de `compose.contenu.yml` : leur cible et leur mode. */
function montagesDuContenu(): { cible: string; mode: string }[] {
  return fs
    .readFileSync(COMPOSE_CONTENU, 'utf8')
    .split(/\r?\n/)
    .flatMap((ligne) => {
      const montage = /^\s*-\s*"\$\{[A-Z_]+:\?\}:(\/[^:"]+):(ro|rw)"\s*$/.exec(ligne);
      return montage === null ? [] : [{ cible: montage[1], mode: montage[2] }];
    });
}

describe('Dockerfile', () => {
  it('l_image_sert_le_contenu_monte_ou_son_exemple', () => {
    const variables = variablesDeLImage();

    expect(variables.get('ANCRAGE_CONTENUS')).toBe('/contenu');
    expect(variables.get('ANCRAGE_EXEMPLE_CONTENU')).toBe('/app/exemple-contenu');
    // L'exemple est bien là où la variable le cherche.
    expect(etapeFinale()).toEqual(
      expect.arrayContaining(['WORKDIR /app', 'COPY exemple-contenu ./exemple-contenu']),
    );
  });

  it('le_contenu_servi_est_le_montage_du_modele_en_lecture_seule', () => {
    const montages = montagesDuContenu();

    expect(montages).toEqual([{ cible: variablesDeLImage().get('ANCRAGE_CONTENUS'), mode: 'ro' }]);
  });
});
