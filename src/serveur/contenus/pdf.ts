/** Rend un document HTML en PDF A4 dans `chemin`. Injectable : les tests ne lancent pas de navigateur. */
export type GenerateurDePdf = (html: string, chemin: string) => Promise<void>;

/** Le générateur réel : le Chromium de Playwright. */
export const pdfParChromium: GenerateurDePdf = async (html, chemin) => {
  const { chromium } = await import('@playwright/test');
  const navigateur = await chromium.launch();
  try {
    const page = await navigateur.newPage();
    await page.setContent(html);
    await page.pdf({
      path: chemin,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await navigateur.close();
  }
};
