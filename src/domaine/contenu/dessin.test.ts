import { describe, expect, it } from 'vitest';
import { defautsDuDessin, ecrireDessin, lireDessin } from './dessin.js';

const CADRE_DEBUT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 340">\n';

/** Les messages des défauts du dessin, dans l'ordre du texte : ils disent quelle règle a joué. */
const messages = (interieur: string) => defautsDuDessin(interieur).map((d) => d.message);

const URL_EXTERNE = expect.stringMatching(/^« url\(… » interdit dans un dessin/);
const STYLE = expect.stringMatching(/^Élément « style » interdit dans un dessin/);
const IMPORT = expect.stringMatching(/^« @import » interdit dans un dessin/);
const IMAGE_SET = expect.stringMatching(/^« image-set\( » interdit dans un dessin/);
const BARRE_INVERSE = expect.stringMatching(
  /^Barre oblique inverse « \\ » interdite dans un dessin/,
);
const REFERENCE = expect.stringMatching(/^Référence de caractère nommée interdite dans un dessin/);
const HORS_LISTE = expect.stringMatching(/^Élément interdit dans un dessin : seuls /);

describe('dessin', () => {
  it('aller_retour_exact', () => {
    const interieur =
      '<path d="M10 10 L20 20" stroke="#c33"/>\n  <circle cx="5" cy="5" r="2"/>\n\n<text x="1">a « b »</text>';
    const texte = ecrireDessin('0 0 320 340', interieur);

    expect(texte).toBe(`${CADRE_DEBUT}${interieur}\n</svg>\n`);
    expect(lireDessin(texte)).toEqual({ viewbox: '0 0 320 340', interieur });
    expect(lireDessin(ecrireDessin('0 0 1 1', ''))).toEqual({ viewbox: '0 0 1 1', interieur: '' });
  });

  it('refuse_un_autre_cadre', () => {
    const interieur = '<circle cx="5" cy="5" r="2"/>';
    const autres = [
      `${CADRE_DEBUT}${interieur}\n</svg>`,
      `${CADRE_DEBUT}${interieur}</svg>\n`,
      `${CADRE_DEBUT}${interieur}\n</svg>\n\n`,
      `${CADRE_DEBUT.replace('\n', '\r\n')}${interieur}\r\n</svg>\r\n`,
      `<svg viewBox="0 0 320 340">\n${interieur}\n</svg>\n`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 340" width="10">\n${interieur}\n</svg>\n`,
      ` ${CADRE_DEBUT}${interieur}\n</svg>\n`,
      `<?xml version="1.0"?>\n${CADRE_DEBUT}${interieur}\n</svg>\n`,
    ];

    for (const texte of autres) expect(lireDessin(texte), texte).toBeUndefined();
  });

  it('set_href_refuse', () => {
    const defauts = defautsDuDessin('<use><set attributeName="href" to="/api/cours"/></use>');

    expect(defauts.map((d) => d.message)).toEqual([expect.stringContaining('« set » interdit')]);
  });

  it('animate_refuse', () => {
    const defauts = defautsDuDessin('<use><animate attributeName="href" values="/api/x"/></use>');

    expect(defauts[0]?.message).toContain('« animate » interdit');
  });

  it('animate_transform_refuse', () => {
    const defauts = defautsDuDessin('<g><animateTransform attributeName="transform"/></g>');

    expect(defauts[0]?.message).toContain('« animateTransform » interdit');
  });

  it('animate_motion_refuse', () => {
    const defauts = defautsDuDessin('<g><animateMotion path="M0 0"/></g>');

    expect(defauts[0]?.message).toContain('« animateMotion » interdit');
  });

  it('url_externe_en_style_refusee', () => {
    expect(messages('<rect style="fill:url(https://autre.example/x.svg#a)"/>')).toEqual([
      URL_EXTERNE,
    ]);
  });

  it('url_d_api_en_attribut_refusee', () => {
    for (const valeur of ['url(/api/cours)', "url( '/api/cours' )", 'URL("/api/cours")']) {
      expect(messages(`<rect fill="${valeur.replaceAll('"', '&quot;')}"/>`), valeur).toEqual([
        URL_EXTERNE,
      ]);
    }
  });

  it('url_interne_admise', () => {
    const interieur = [
      '<rect fill="url(#degrade)"/>',
      `<rect style="fill:url( '#degrade' )"/>`,
      `<path marker-end="url('#fleche')"/>`,
    ].join('');

    expect(defautsDuDessin(interieur)).toEqual([]);
  });

  /*
   * 2b-D7 : la politique du serveur permet les styles en ligne et les images en `data:` ou de
   * l'application. Un style qui charge `/api/…` ferait une requête avec le cookie de la personne.
   */
  it('reference_nommee_refusee', () => {
    // `&lpar;` est « ( » : le CSS lirait `url(`.
    expect(messages('<rect style="mask-image:url&lpar;/api/moi/export)"/>')).toEqual([REFERENCE]);
    // Le nom est pris en entier : `&ampx;` n'est pas `&amp;`.
    expect(messages('<text x="1">&ampx;</text>')).toEqual([REFERENCE]);
  });

  it('echappement_css_refuse', () => {
    // `\72` est « r » : le CSS lirait `url(`.
    expect(messages('<rect style="mask-image:u\\72l(/api/moi/export)"/>')).toEqual([BARRE_INVERSE]);
  });

  it('image_set_refuse', () => {
    for (const valeur of [
      "image-set('/api/moi/export' 1x)",
      '-webkit-image-set(&quot;/api/moi/export&quot; 1x)',
    ]) {
      expect(messages(`<rect style="mask-image:${valeur}"/>`), valeur).toEqual([IMAGE_SET]);
    }
  });

  it('import_en_style_refuse', () => {
    expect(messages('<style>@import "/api/moi/export";</style>')).toEqual([STYLE, IMPORT]);
  });

  it('references_permises_et_url_interne_admises', () => {
    const interieur = [
      '<text x="1">a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;</text>',
      '<rect fill="url(#degrade)"/>',
    ].join('');

    expect(defautsDuDessin(interieur)).toEqual([]);
  });

  it('casse_ignoree', () => {
    expect(messages('<SET attributeName="href" to="/api/x"/>')).toEqual([
      expect.stringContaining('« set » interdit'),
    ]);
    expect(messages('<AnimateMotion/>')).toEqual([
      expect.stringContaining('« animateMotion » interdit'),
    ]);
    expect(messages('<STYLE>@IMPORT "/api/x";</STYLE>')).toEqual([STYLE, IMPORT]);
    expect(messages('<rect style="mask-image:Image-Set(&quot;/api/x&quot; 1x)"/>')).toEqual([
      IMAGE_SET,
    ]);
    expect(messages('<rect style="mask-image:URL&LPAR;/api/x)"/>')).toEqual([REFERENCE]);
  });

  /*
   * Inséré dans un `<g>` SVG, un élément HTML comme `img`, `meta` ou `table` sort du SVG. Il
   * charge alors sa ressource (`img-src 'self'`) ou recharge la page. Seule une liste d'éléments
   * SVG est admise.
   */
  it('element_html_img_refuse', () => {
    expect(messages('<rect/><img src="/api/img">')).toEqual([HORS_LISTE]);
  });

  it('element_html_meta_refuse', () => {
    // `content=` ressemble à un attribut `on…=` : la règle des événements joue aussi.
    expect(messages('<meta http-equiv="refresh" content="0;url=/api/meta">')).toEqual([
      HORS_LISTE,
      expect.stringMatching(/^Attribut d'événement/),
    ]);
  });

  it('element_html_table_refuse', () => {
    // Chaque balise, ouvrante ou fermante.
    expect(messages('<table><tr><td><img src="/api/table"></td></tr></table>')).toEqual(
      Array(7).fill(HORS_LISTE),
    );
  });

  it('element_inconnu_refuse', () => {
    expect(messages('<foo>texte</foo>')).toEqual([HORS_LISTE, HORS_LISTE]);
  });

  it('element_hors_liste_en_majuscules_refuse', () => {
    expect(messages('<IMG SRC="/api/x">')).toEqual([HORS_LISTE]);
  });

  it('element_nomme_garde_son_seul_message', () => {
    expect(messages('<script>x</script><iframe></iframe><setx/>')).toEqual([
      expect.stringContaining('« script » interdit'),
      expect.stringContaining('« iframe » interdit'),
      expect.stringContaining('« set » interdit'),
    ]);
  });

  it('elements_admis_acceptes', () => {
    const interieur = [
      '<defs>',
      '<linearGradient id="d"><stop offset="0"/></linearGradient>',
      '<radialGradient id="r"><stop offset="1"/></radialGradient>',
      '<clipPath id="c"><rect width="1" height="1"/></clipPath>',
      '<mask id="k"><circle r="1"/></mask>',
      '<pattern id="m" width="1" height="1"><ellipse rx="1" ry="1"/></pattern>',
      '<marker id="f"><path d="M0 0"/></marker>',
      '<symbol id="s"><polygon points="0 0 1 1"/></symbol>',
      '<path id="p" d="M0 0 L1 1"/>',
      '</defs>',
      '<g clip-path="url(#c)" fill="url(#d)">',
      '<title>Herz</title><desc>Schema</desc>',
      // Une balise sur deux lignes, et une autre en majuscules.
      '<line\nx2="1" marker-end="url(#f)"/><POLYLINE points="0 0 1 1"/>',
      '<text x="1"><tspan>a</tspan><textPath href="#p">b</textPath></text>',
      '<use href="#s"/>',
      '</g>',
    ].join('\n');

    expect(defautsDuDessin(interieur)).toEqual([]);
  });
});
