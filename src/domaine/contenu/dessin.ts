/*
 * Le cadre exact d'un fichier SVG de schéma, au format 1 :
 * `<svg xmlns="http://www.w3.org/2000/svg" viewBox="…">\n<intérieur>\n</svg>\n`.
 * L'intérieur est gardé à l'octet près.
 */

const CADRE =
  /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"\n]*)">\n([\s\S]*)\n<\/svg>\n$/;

/** Rend la viewBox et l'intérieur d'un SVG qui a exactement le cadre du format 1, sinon `undefined`. */
export function lireDessin(texte: string): { viewbox: string; interieur: string } | undefined {
  const morceaux = CADRE.exec(texte);
  return morceaux ? { viewbox: morceaux[1], interieur: morceaux[2] } : undefined;
}

/** L'inverse de `lireDessin`. */
export function ecrireDessin(viewbox: string, interieur: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewbox}">\n${interieur}\n</svg>\n`;
}

/** Un défaut d'un dessin : sa position dans l'intérieur (un indice de caractère), et son message. */
export interface DefautDuDessin {
  position: number;
  message: string;
}

const REFERENCE = /&(?:#(\d+)|#x([0-9a-f]+)|(colon|tab|newline));?/iy;
const NOMMEES: Readonly<Record<string, string>> = { colon: ':', tab: '\t', newline: '\n' };
const CODE_MAX = 0x10ffff;
const RETIRES = new Set(['\t', '\n', '\r']);

/** Le caractère d'une référence (`&#106;`, `&#x6a;`, `&colon;`…). */
function caractereDe([, decimal, hexadecimal, nom]: RegExpExecArray): string {
  if (nom !== undefined) return NOMMEES[nom.toLowerCase()] ?? '';
  const code = decimal === undefined ? Number.parseInt(hexadecimal, 16) : Number(decimal);
  return code <= CODE_MAX ? String.fromCodePoint(code) : '\ufffd';
}

/**
 * Le texte tel que le lit le navigateur, pour y chercher ce qui est interdit : les références de
 * caractère numériques (`&#106;`, `&#x6a;`) et `&colon;`, `&Tab;`, `&NewLine;` décodées, puis les
 * tabulations et les sauts de ligne retirés, comme le fait l'analyseur d'URL (`java&#9;script:`
 * est `javascript:`). Chaque caractère gardé note sa position dans le texte d'origine.
 */
function telQueLu(texte: string): { lu: string; positions: number[] } {
  let lu = '';
  const positions: number[] = [];
  let i = 0;
  while (i < texte.length) {
    REFERENCE.lastIndex = i;
    const reference = REFERENCE.exec(texte);
    const caractere = reference === null ? texte[i] : caractereDe(reference);
    if (caractere !== '' && !RETIRES.has(caractere)) {
      lu += caractere;
      positions.push(i);
    }
    i += reference === null ? 1 : reference[0].length;
  }
  return { lu, positions };
}

const NOMS_DES_ELEMENTS: Readonly<Record<string, string>> = {
  script: 'script',
  foreignobject: 'foreignObject',
  iframe: 'iframe',
  object: 'object',
  embed: 'embed',
  animatemotion: 'animateMotion',
  animatetransform: 'animateTransform',
  animate: 'animate',
  set: 'set',
};
const ELEMENT_INTERDIT =
  /<(script|foreignobject|iframe|object|embed|animatemotion|animatetransform|animate|set)/gi;
const ATTRIBUT_D_EVENEMENT = /on[a-z]+\s*=/gi;
const JAVASCRIPT = /javascript:/gi;
/**
 * `url(` dont l'argument, entre guillemets ou non, ne commence pas par `#`, en attribut comme en
 * `style` : `url(#degrade)` reste admis, `url(/api/…)` ne l'est pas.
 */
const URL_HORS_DU_DESSIN = /url\s*\((?!\s*["']?\s*#)/gi;
/**
 * `href` ou `xlink:href` dont la valeur, entre guillemets ou non, ne commence pas par `#`. Le
 * `(?=\S)` empêche de revenir sur les espaces qui précèdent la valeur.
 */
const LIEN_HORS_DU_DESSIN = /href\s*=\s*(?=\S)(?:"(?!#)|'(?!#)|(?!["'#]))/gi;
const ELEMENT_STYLE = /<style/gi;
const IMPORT = /@import/gi;
/** Sans ancrage, le motif attrape aussi `-webkit-image-set(`. */
const IMAGE_SET = /image-set\s*\(/gi;
/** Un échappement CSS : `u\72l(` se lit `url(`. */
const BARRE_INVERSE = /\\/g;
/**
 * Une référence nommée que `telQueLu` laisse telle quelle : `&lpar;` se lit « ( ». Le nom est pris
 * en entier, pour que `&ampx;` ne passe pas pour `&amp;`.
 */
const REFERENCE_NOMMEE = /&(?!(?:amp|lt|gt|quot|apos)(?![a-z0-9]))[a-z][a-z0-9]*;?/gi;

/** Les seuls éléments admis dans un dessin, quelle que soit la casse (2b-D7). */
const ELEMENTS_ADMIS = (
  'g path rect circle ellipse line polyline polygon text tspan textPath defs linearGradient ' +
  'radialGradient stop pattern clipPath mask marker symbol use title desc'
).split(' ');
const NOMS_ADMIS = new Set(ELEMENTS_ADMIS.map((nom) => nom.toLowerCase()));
/** Les éléments qui ont leur propre message (`ELEMENT_INTERDIT`, `ELEMENT_STYLE`). */
const NOMS_A_MESSAGE = [...Object.keys(NOMS_DES_ELEMENTS), 'style'];
/**
 * Une balise ouvrante ou fermante, comme la lit l'analyseur HTML : `<` ou `</`, une lettre, puis le
 * nom jusqu'à un blanc, `/` ou `>`.
 */
const BALISE = /<\/?([a-z][^\t\n\f\r />]*)/gi;
const HORS_DE_LA_LISTE =
  `Élément interdit dans un dessin : seuls ${ELEMENTS_ADMIS.slice(0, -1).join(', ')} et ` +
  `${ELEMENTS_ADMIS.at(-1)} y sont admis.`;

/**
 * Les balises d'un élément hors de `ELEMENTS_ADMIS`, sauf celles des éléments qui ont leur propre
 * message : leur règle les attrape déjà, en tête d'un nom plus long aussi (`<setx`). Les noms se
 * lisent sur le texte brut, comme le fait l'analyseur HTML : une référence de caractère ne forme
 * jamais une balise. Et `telQueLu`, qui retire les sauts de ligne, collerait au nom l'attribut de
 * la ligne suivante (`<rect` puis `x="1"` donneraient `rectx`).
 */
function elementsHorsDeLaListe(interieur: string): DefautDuDessin[] {
  const defauts: DefautDuDessin[] = [];
  for (const balise of interieur.matchAll(BALISE)) {
    const nom = balise[1].toLowerCase();
    if (NOMS_ADMIS.has(nom) || NOMS_A_MESSAGE.some((autre) => nom.startsWith(autre))) continue;
    defauts.push({ position: balise.index, message: HORS_DE_LA_LISTE });
  }
  return defauts;
}

/**
 * Ce qui, dans l'intérieur d'un dessin, pourrait exécuter du code ou charger une ressource hors du
 * dessin (R37) : le client l'insère tel quel dans un `<g>` de la page (`DessinSchema.tsx`).
 *
 * Seuls les éléments de `ELEMENTS_ADMIS` sont admis, quelle que soit la casse. Toute autre balise,
 * ouvrante ou fermante, est refusée, sauf la fermante seule d'un élément à message (`</script>`),
 * qui ne crée rien. Un élément HTML comme `img`, `meta` ou `table` sortirait du SVG, puis
 * chargerait sa ressource ou rechargerait la page (2b-D7). Ceux-ci sont refusés avec leur propre
 * message :
 * - `script`, `foreignObject`, `iframe`, `object`, `embed` et `style` ;
 * - les éléments d'animation (`animate`, `animateMotion`, `animateTransform` et `set`, qui
 *   changeraient un `href` après coup, 2b-D7).
 *
 * Dans tout le dessin, sont refusés aussi :
 * - tout attribut `on…=`, et tout `javascript:` ;
 * - tout `href` ou `xlink:href` qui ne vise pas un élément du dessin (`#…`) ;
 * - tout `url(…)` qui ne vise pas `#…`, tout `image-set(` (`-webkit-image-set(` compris) et tout
 *   `@import` : la politique du serveur permet les styles en ligne et les images de l'application,
 *   et une ressource chargée de `/api/…` partirait avec le cookie (2b-D7) ;
 * - toute barre oblique inverse `\` : en CSS, `u\72l(` est `url(` ;
 * - toute référence nommée autre que `&amp;`, `&lt;`, `&gt;`, `&quot;` et `&apos;` : `&lpar;` est
 *   « ( ».
 *
 * La liste se vérifie sur le texte brut (`elementsHorsDeLaListe`). Le reste, éléments à message
 * compris, se cherche sur le texte tel que le lit le navigateur (`telQueLu`) : les références
 * numériques, `&colon;`, `&Tab;` et `&NewLine;` y sont décodées, si bien qu'elles passent quand ce
 * qu'elles écrivent passe. La recherche ne tient compte ni de la casse ni de la place dans la
 * balise : un texte qui ressemble à ce qui est refusé l'est aussi. Les messages ne citent pas le
 * texte du dessin. Dans l'ordre du texte.
 */
export function defautsDuDessin(interieur: string): DefautDuDessin[] {
  const { lu, positions } = telQueLu(interieur);
  const defauts: DefautDuDessin[] = [];
  const chercher = (motif: RegExp, message: (trouve: RegExpExecArray) => string) => {
    for (const trouve of lu.matchAll(motif)) {
      defauts.push({ position: positions[trouve.index], message: message(trouve) });
    }
  };
  chercher(
    ELEMENT_INTERDIT,
    ([, nom]) =>
      `Élément « ${NOMS_DES_ELEMENTS[nom.toLowerCase()]} » interdit dans un dessin : il exécute du code ou charge un autre contenu.`,
  );
  defauts.push(...elementsHorsDeLaListe(interieur));
  chercher(
    ATTRIBUT_D_EVENEMENT,
    () => "Attribut d'événement (on…) interdit dans un dessin : il exécute du code.",
  );
  chercher(JAVASCRIPT, () => '« javascript: » interdit dans un dessin : il exécute du code.');
  chercher(
    LIEN_HORS_DU_DESSIN,
    () =>
      "Lien interdit dans un dessin : href et xlink:href ne peuvent viser qu'un élément du dessin (« #… »).",
  );
  chercher(
    URL_HORS_DU_DESSIN,
    () =>
      "« url(… » interdit dans un dessin hors d'un élément du dessin (« url(#…) ») : il charge une ressource.",
  );
  chercher(
    ELEMENT_STYLE,
    () =>
      'Élément « style » interdit dans un dessin : une feuille de style peut charger une ressource.',
  );
  chercher(IMPORT, () => '« @import » interdit dans un dessin : il charge une ressource.');
  chercher(IMAGE_SET, () => '« image-set( » interdit dans un dessin : il charge une ressource.');
  chercher(
    BARRE_INVERSE,
    () =>
      'Barre oblique inverse « \\ » interdite dans un dessin : en CSS, un échappement peut cacher un texte interdit.',
  );
  chercher(
    REFERENCE_NOMMEE,
    () =>
      'Référence de caractère nommée interdite dans un dessin, hors de &amp;, &lt;, &gt;, &quot; et &apos; : elle peut cacher un texte interdit.',
  );
  return defauts.sort((a, b) => a.position - b.position);
}
