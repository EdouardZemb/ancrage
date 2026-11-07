// Les globs d'un groupe de mutation, lus dans `stryker.config.json` (la seule liste, ancrage-donnees#156) :
// `node scripts/mutation-groupe.mjs <domaine|serveur> [--config <fichier>]`.
// Le workflow `mutation.yml` lance un job par groupe ; au poste, le script sert à voir ce qu'un
// groupe mute (`jq` n'y est pas).
//
// - Un groupe prend les globs qui commencent par `src/<groupe>/`, ou par `!src/<groupe>/` pour une
//   négation, joints par des virgules, dans l'ordre de la configuration.
// - Un glob d'aucun groupe ferait un fichier que personne ne mute : le script échoue (code 1).
import fs from 'node:fs';
import path from 'node:path';

const GROUPES = ['domaine', 'serveur'];

function echouer(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let config = 'stryker.config.json';
const positionnels = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') {
    config = args[++i];
    if (!config) echouer('--config demande un fichier.');
  } else {
    positionnels.push(args[i]);
  }
}

const groupe = positionnels[0];
if (positionnels.length !== 1 || !GROUPES.includes(groupe)) {
  echouer(
    `Groupe de mutation inconnu : « ${positionnels.join(' ')} » (attendu : ${GROUPES.join(' ou ')}).`,
  );
}

let mutate;
try {
  mutate = JSON.parse(fs.readFileSync(path.resolve(config), 'utf8')).mutate;
} catch (e) {
  echouer(`Configuration illisible (${config}) : ${e.message}`);
}
if (!Array.isArray(mutate)) echouer(`${config} n'a pas de liste « mutate ».`);

const nu = (glob) => glob.replace(/^!/, '');
const orphelins = mutate.filter((g) => !GROUPES.some((nom) => nu(g).startsWith(`src/${nom}/`)));
if (orphelins.length > 0) {
  echouer(
    `Aucun groupe de mutation pour : ${orphelins.join(', ')}. Ils iraient dans « domaine » ou « serveur » (mutation-groupe.mjs).`,
  );
}

const globs = mutate.filter((g) => nu(g).startsWith(`src/${groupe}/`));
if (globs.length === 0) echouer(`Le groupe « ${groupe} » n'a aucun glob dans ${config}.`);
console.log(globs.join(','));
