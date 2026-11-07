/*
 * Une PR de documentation pure (2b-D1) : chaque chemin changé est de la documentation. La CI s'en
 * sert pour sauter l'image et le bout en bout. Une liste vide ou un doute font tout lancer.
 *
 * Lancé par `node` (Node 24 retire les types) : ce module n'importe rien du projet et n'emploie que
 * la syntaxe de TypeScript qui s'efface.
 */

const DOCUMENTATION: readonly RegExp[] = [
  /^docs\/.*\.md$/,
  /^[^/]+\.md$/,
  /^\.claude\/plans\/.*\.md$/,
  /^\.claude\/skills\/.*\.md$/,
  /^\.github\/pull_request_template\.md$/,
];

export function estDocumentationSeule(chemins: readonly string[]): boolean {
  if (chemins.length === 0) return false;
  return chemins.every((chemin) => DOCUMENTATION.some((motif) => motif.test(chemin)));
}

// Ligne de commande : les chemins sur l'entrée standard, un par ligne ; écrit `true` ou `false`.
// Seulement quand le module est lancé directement, pas quand vitest l'importe.
if (process.argv[1]?.endsWith('documentation-seule.ts')) {
  const morceaux: Buffer[] = [];
  for await (const morceau of process.stdin) morceaux.push(morceau as Buffer);
  const chemins = Buffer.concat(morceaux)
    .toString('utf8')
    .split(/\r?\n/)
    .filter((ligne) => ligne !== '');
  process.stdout.write(`${estDocumentationSeule(chemins)}\n`);
}
