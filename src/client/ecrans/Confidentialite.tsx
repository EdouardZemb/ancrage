import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { estUneCibleAdmise, type ValeursDeNotice } from '../../domaine/notice.js';
import { GABARIT_DE_NOTICE, noticeComposee } from '../../domaine/notice-gabarit.js';
import { useApp } from '../contexte.js';
import { chargerNotice, lireNoticeLocale } from '../notice-locale.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';
import { LANGUES, type Langue, textes } from '../textes.js';

/** Un texte à chercher tel quel dans une expression régulière : ses caractères spéciaux échappés. */
function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Decoupage = (texte: string) => ComponentChildren;

/**
 * Le découpage des textes de la notice : les adresses de `liens` y deviennent des liens simples,
 * une navigation quand on les touche, jamais une requête au chargement. La plus longue adresse
 * l'emporte quand deux commencent de même. Le reste du texte est du texte : une balise qu'il porte
 * s'affiche telle quelle.
 */
function decoupageDes(liens: ValeursDeNotice['liens']): Decoupage {
  const cibles = new Map(
    liens.filter(({ cible }) => estUneCibleAdmise(cible)).map(({ texte, cible }) => [texte, cible]),
  );
  if (cibles.size === 0) return (texte) => texte;
  const adresses = [...cibles.keys()].sort((a, b) => b.length - a.length);
  const motif = new RegExp(`(${adresses.map(echapper).join('|')})`);
  // `split` sur un motif capturant : les adresses sont aux rangs impairs.
  return (texte) =>
    texte.split(motif).map((morceau, rang) => {
      const cible = rang % 2 === 1 ? cibles.get(morceau) : undefined;
      return cible === undefined ? morceau : <a href={cible}>{morceau}</a>;
    });
}

type EtatNotice =
  | { etat: 'chargement' }
  /** Ni copie sur l'appareil, ni réseau. */
  | { etat: 'absente' }
  | { etat: 'prete'; valeurs: ValeursDeNotice };

/**
 * Les valeurs de la notice : la copie de l'appareil d'abord, puis, une fois, celles du serveur, qui
 * la remplacent (S1-D8). Sans réseau, la copie reste ; sans copie, la notice est absente.
 */
function useValeursDeNotice(): EtatNotice {
  const [etat, setEtat] = useState<EtatNotice>({ etat: 'chargement' });
  useEffect(() => {
    let actif = true;
    void (async () => {
      const base = await baseDeLaPage().catch(() => undefined);
      const copie = base && (await lireNoticeLocale(base).catch(() => undefined));
      if (actif && copie !== undefined) setEtat({ etat: 'prete', valeurs: copie });
      const chargee = await chargerNotice(base);
      if (actif)
        setEtat(chargee === undefined ? { etat: 'absente' } : { etat: 'prete', valeurs: chargee });
    })();
    return () => {
      actif = false;
    };
  }, []);
  return etat;
}

/**
 * La notice de confidentialité (`/confidentialite`, 1e-D15) : un écran public, que le pied de page
 * de tous les écrans propose, avant tout compte comme après. Elle s'ouvre dans la langue de
 * l'application, celle de la personne ou, à défaut, celle du téléphone. Deux boutons la font passer
 * de l'allemand au français et retour, sans rien changer à la langue de l'application ; l'article
 * porte la langue de son texte.
 *
 * Son texte est le gabarit du code (`notice-gabarit.ts`), rempli des valeurs de l'instance, que
 * l'écran lit du serveur et dont l'appareil garde la dernière copie (S1-D8). Sans réseau ni copie,
 * l'article ne montre que son titre et une phrase qui le dit (S1-D9).
 */
export function Confidentialite() {
  const { t, langue } = useApp();
  // Rien tant que la personne n'a pas choisi : la notice suit la langue de l'application.
  const [choix, setChoix] = useState<Langue | undefined>();
  const affichee = choix ?? langue;
  const etat = useValeursDeNotice();
  const valeurs = etat.etat === 'prete' ? etat.valeurs : undefined;
  const avecLiens = useMemo(() => decoupageDes(valeurs?.liens ?? []), [valeurs]);
  const notice = valeurs === undefined ? undefined : noticeComposee(affichee, valeurs);

  return (
    <>
      <fieldset class="choix-langue">
        <legend>{t.langue_choix}</legend>
        {LANGUES.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            class={affichee === code ? 'principal' : 'secondaire'}
            aria-pressed={affichee === code}
            onClick={() => setChoix(code)}
          >
            {t[`langue_${code}`]}
          </button>
        ))}
      </fieldset>

      <article class="notice" lang={affichee}>
        <h2>{GABARIT_DE_NOTICE[affichee].titre}</h2>
        {notice === undefined ? (
          <p>
            {etat.etat === 'absente'
              ? textes[affichee].notice_hors_ligne
              : textes[affichee].chargement}
          </p>
        ) : (
          <>
            <p>{notice.introduction}</p>
            {notice.sections.map((section) => (
              <section key={section.titre}>
                <h3>{section.titre}</h3>
                {section.liste !== undefined && (
                  <ul>
                    {section.liste.map((element) => (
                      <li key={element}>{avecLiens(element)}</li>
                    ))}
                  </ul>
                )}
                {section.paragraphes?.map((paragraphe) => (
                  <p key={paragraphe}>{avecLiens(paragraphe)}</p>
                ))}
              </section>
            ))}
          </>
        )}
      </article>
    </>
  );
}
