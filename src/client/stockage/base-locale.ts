/*
 * La base IndexedDB de l'appareil (ADR-0004, décisions 11 et 12 du lot 1d) : la copie locale du
 * journal de progression, la file d'envoi, et le contenu des cours que la personne a le droit de
 * lire. Le contenu vit ici, jamais dans le cache du service worker (invariant 3).
 *
 * Tout est rangé **par personne**, la personne en tête de chaque clé : sur un téléphone partagé,
 * une personne ne voit rien de ce qu'une autre a laissé (`reserverA`). Une donnée n'est jamais
 * rangée sous une autre personne que l'argument `personne` des fonctions : un `personne` venu
 * d'ailleurs (une réponse du serveur, par exemple) n'est pas cru.
 *
 * Un même `id` d'événement n'est jamais rangé deux fois pour une personne : la clé l'interdit.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { CoursServi } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import type { ValeursDeNotice } from '../../domaine/notice.js';
import type { CoursResume, Moi } from '../api.js';

export const NOM_BASE = 'ancrage';
const VERSION = 1;

/** Un événement rangé : la clé est (`personne`, `id`), l'index (`personne`, `cours`). */
export interface EvenementRange {
  personne: string;
  id: string;
  cours: string;
  evenement: Evenement;
}

export interface SchemaBaseLocale extends DBSchema {
  /** Le journal local : les réponses données ici, et celles que les autres appareils ont envoyées. */
  evenements: {
    key: [personne: string, id: string];
    value: EvenementRange;
    indexes: { par_cours: [personne: string, cours: string] };
  };
  /** Les événements pas encore partis (ou dont la réponse du serveur s'est perdue). */
  file: {
    key: [personne: string, id: string];
    value: EvenementRange;
    indexes: { par_cours: [personne: string, cours: string] };
  };
  /** Le contenu d'un cours, tel que l'API l'a servi. */
  cours: {
    key: [personne: string, id: string];
    value: { personne: string; id: string; contenu: CoursServi };
  };
  /** La liste des cours de la personne. */
  listes: {
    key: string;
    value: { personne: string; liste: CoursResume[] };
  };
  /**
   * Le curseur de lecture du journal d'un cours : le dernier numéro reçu du serveur, et l'`id` de
   * l'événement de ce numéro (absent si le curseur est 0).
   *
   * `envoyes` est la note des envois (2b-D4) : les `id` que le serveur a acceptés et qu'aucune
   * lecture menée jusqu'au bout n'a encore rendus. Le champ est optionnel, pour ne pas changer la
   * version de la base : le client de la version précédente l'ignore, et s'il réécrit
   * l'enregistrement sans lui, la note est simplement vide.
   */
  curseurs: {
    key: [personne: string, cours: string];
    value: {
      personne: string;
      cours: string;
      curseur: number;
      dernier?: string;
      envoyes?: string[];
    };
  };
  /**
   * Ce que l'application sait de la personne connectée, pour démarrer hors ligne, et la dernière
   * copie de la notice de l'instance, pour la lire hors ligne (`notice-locale.ts`, S1-D8).
   */
  etat: {
    key: string;
    value: { cle: 'moi'; valeur: Moi } | { cle: 'notice'; valeur: ValeursDeNotice };
  };
}

export type BaseLocale = IDBPDatabase<SchemaBaseLocale>;

export async function ouvrirBaseLocale(nom: string = NOM_BASE): Promise<BaseLocale> {
  const base = await openDB<SchemaBaseLocale>(nom, VERSION, {
    upgrade(base) {
      base
        .createObjectStore('evenements', { keyPath: ['personne', 'id'] })
        .createIndex('par_cours', ['personne', 'cours']);
      base
        .createObjectStore('file', { keyPath: ['personne', 'id'] })
        .createIndex('par_cours', ['personne', 'cours']);
      base.createObjectStore('cours', { keyPath: ['personne', 'id'] });
      base.createObjectStore('listes', { keyPath: 'personne' });
      base.createObjectStore('curseurs', { keyPath: ['personne', 'cours'] });
      base.createObjectStore('etat', { keyPath: 'cle' });
    },
    // Une version suivante de la base ne doit pas rester bloquée par la connexion de celle-ci (un
    // autre onglet, le service worker) : on la ferme. L'application recharge alors la page.
    blocking() {
      base.close();
    },
  });
  return base;
}

/**
 * La personne que l'appareil connaît : la dernière connectée ici (`memoriserMoi`), ou `undefined`.
 * Elle permet de démarrer hors ligne, et désigne la file qu'envoie le service worker.
 */
export async function moiLocal(base: BaseLocale): Promise<Moi | undefined> {
  const lu = await base.get('etat', 'moi');
  return lu?.cle === 'moi' ? lu.valeur : undefined;
}

/** Retient la personne connectée sur l'appareil. */
export async function memoriserMoi(base: BaseLocale, moi: Moi): Promise<void> {
  await base.put('etat', { cle: 'moi', valeur: moi });
}

/** Oublie la personne connue de l'appareil. */
export async function oublierMoi(base: BaseLocale): Promise<void> {
  await base.delete('etat', 'moi');
}

/**
 * Vide tout, sauf les files d'envoi : journal local, contenus, listes, curseurs (et leur note des
 * envois), identité, copie de la notice (S1-D8). Pour la déconnexion (décision 12) : les réponses
 * pas encore parties, de chaque personne, restent, et partiront sous la session de leur personne
 * (R33). Une file ne garde que des réponses en attente : vide, elle n'existe pas.
 */
export async function viderSaufLesFiles(base: BaseLocale): Promise<void> {
  const noms = [...base.objectStoreNames].filter((nom) => nom !== 'file');
  const tx = base.transaction(noms, 'readwrite');
  await Promise.all([...noms.map((nom) => tx.objectStore(nom).clear()), tx.done]);
}

/**
 * Réserve l'appareil à `personne` : efface tout ce qui est à une autre personne (cours, contenu,
 * événements, curseurs et leur note des envois, ce que l'on sait d'elle), **sauf les files
 * d'envoi**. Une file reste attachée à sa personne et n'est envoyée que sous sa session
 * (ADR-0004) : elle ne se perd pas parce qu'une autre personne s'est connectée entre-temps
 * (décision 12).
 */
export async function reserverA(base: BaseLocale, personne: string): Promise<void> {
  const tx = base.transaction(['evenements', 'cours', 'listes', 'curseurs', 'etat'], 'readwrite');

  // Les magasins à clé composée : la personne est le premier élément de la clé.
  const effacerLesAutres = async (nom: 'evenements' | 'cours' | 'curseurs') => {
    const magasin = tx.objectStore(nom);
    const cles = await magasin.getAllKeys();
    await Promise.all(
      cles.filter(([proprietaire]) => proprietaire !== personne).map((cle) => magasin.delete(cle)),
    );
  };
  const effacerLesListes = async () => {
    const magasin = tx.objectStore('listes');
    const cles = await magasin.getAllKeys();
    await Promise.all(cles.filter((cle) => cle !== personne).map((cle) => magasin.delete(cle)));
  };
  const effacerMoiSiAutre = async () => {
    const magasin = tx.objectStore('etat');
    const moi = await magasin.get('moi');
    if (moi?.cle === 'moi' && moi.valeur.id !== personne) await magasin.delete('moi');
  };

  await Promise.all([
    effacerLesAutres('evenements'),
    effacerLesAutres('cours'),
    effacerLesAutres('curseurs'),
    effacerLesListes(),
    effacerMoiSiAutre(),
    tx.done,
  ]);
}

/** Toutes les clés d'une personne, pour un magasin ou un index dont la clé est `[personne, …]`. */
export function clesDe(personne: string): IDBKeyRange {
  // Une clé `[personne]` précède toute `[personne, texte]`, et un tableau suit tout texte.
  return IDBKeyRange.bound([personne], [personne, []]);
}
