/*
 * La feuille de style du rapport de suivi, écrite dans la page : le rapport n'a ni fichier de style
 * ni police à charger. Les couleurs sont des jetons sur `:root`, redéfinis pour le thème sombre ; les
 * séries (`s1` à `s3`) et les boîtes (`b0` à `b5`) donnent chacune leur couleur par `--c`.
 */
export const FEUILLE_DE_STYLE = `
:root {
  color-scheme: light dark;
  --surface: #fcfcfb;
  --plan: #f9f9f7;
  --encre: #0b0b0b;
  --encre2: #52514e;
  --muet: #898781;
  --grille: #e1e0d9;
  --base: #c3c2b7;
  --serie1: #2a78d6;
  --serie2: #eb6834;
  --serie3: #1baf7a;
  --b0: #d9d8d2;
  --b1: #cde2fb;
  --b2: #9ec5f4;
  --b3: #5598e7;
  --b4: #256abf;
  --b5: #104281;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --surface: #1a1a19;
    --plan: #0d0d0d;
    --encre: #f0efec;
    --encre2: #c3c2b7;
    --grille: #2c2c2a;
    --base: #383835;
    --serie1: #3987e5;
    --serie2: #d95926;
    --serie3: #199e70;
    --b0: #3a3a37;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--plan);
  color: var(--encre);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
main { max-width: 800px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 8px; }
h2 { font-size: 1.15rem; line-height: 1.3; margin: 0 0 12px; }
h3 { font-size: 0.95rem; margin: 16px 0 6px; color: var(--encre2); font-weight: 600; }
p { margin: 8px 0; }
.meta { color: var(--encre2); font-size: 0.9rem; margin: 4px 0; }
section {
  background: var(--surface);
  border: 1px solid var(--grille);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}
section.tuiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  background: none;
  border: 0;
  padding: 0;
}
.tuile {
  background: var(--surface);
  border: 1px solid var(--grille);
  border-radius: 8px;
  padding: 12px;
}
.tuile .valeur { font-size: 1.8rem; font-weight: 650; line-height: 1.1; font-variant-numeric: tabular-nums; }
.tuile .texte { font-size: 0.9rem; margin-top: 4px; }
.tuile .detail { font-size: 0.8rem; color: var(--encre2); margin-top: 2px; }
svg { display: block; width: 100%; height: auto; }
svg text { font: 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
svg .axe { fill: var(--muet); font-size: 11px; }
svg .encre { fill: var(--encre); font-size: 12.5px; }
svg .grille { stroke: var(--grille); stroke-width: 1; }
svg .base { stroke: var(--base); stroke-width: 1; }
svg .repere { stroke: var(--muet); stroke-width: 1; stroke-dasharray: 3 3; }
svg .barre { fill: var(--base); }
svg .piste { fill: var(--grille); }
svg .ligne { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
svg .ligne.pointille { stroke-dasharray: 6 4; }
svg .point, svg rect.s1, svg rect.s2, svg rect.s3, svg rect.b0, svg rect.b1, svg rect.b2,
svg rect.b3, svg rect.b4, svg rect.b5 { fill: var(--c); }
.s1 { --c: var(--serie1); }
.s2 { --c: var(--serie2); }
.s3 { --c: var(--serie3); }
.b0 { --c: var(--b0); }
.b1 { --c: var(--b1); }
.b2 { --c: var(--b2); }
.b3 { --c: var(--b3); }
.b4 { --c: var(--b4); }
.b5 { --c: var(--b5); }
.barre-grise { --c: var(--base); }
.legende { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 0; margin: 8px 0; font-size: 0.85rem; }
.legende li { display: flex; align-items: center; gap: 6px; }
.puce { display: inline-block; width: 12px; height: 12px; border-radius: 4px; background: var(--c); flex: none; }
details { margin: 8px 0; }
summary { cursor: pointer; font-size: 0.85rem; color: var(--encre2); }
table { border-collapse: collapse; width: 100%; font-size: 0.85rem; margin: 8px 0; font-variant-numeric: tabular-nums; }
.tableau { overflow-x: auto; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--grille); }
thead th { color: var(--encre2); font-weight: 600; }
tbody th { font-weight: 400; }
ul { padding-left: 20px; }
li { margin: 6px 0; }
code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 0.9em; }
@media print { body { background: #fff; } section { break-inside: avoid; } }
`;
