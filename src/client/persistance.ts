/*
 * Le stockage persistant (1e-D12). Sans lui, le navigateur peut effacer IndexedDB quand l'appareil
 * manque de place, et avec lui la file des réponses pas encore envoyées.
 * `navigator.storage.persist()` demande à ne pas l'être. Chrome répond sans boîte de dialogue,
 * d'après ce qu'il sait du site (application installée, visites fréquentes), et la réponse peut
 * être « non » sans que ce soit une erreur : la file reste alors exposée, comme avant.
 */

type Stockage = Pick<StorageManager, 'persist' | 'persisted'>;

/** Le gestionnaire de stockage du navigateur ; `undefined` s'il n'en a pas ou refuse l'accès. */
function stockageDuNavigateur(): Stockage | undefined {
  try {
    return navigator.storage;
  } catch {
    return undefined;
  }
}

/**
 * Demande que le stockage de l'application soit persistant, si ce n'est pas déjà le cas. Rend
 * `true` si le stockage l'est, `false` sinon : refus du navigateur, API absente, ou toute erreur.
 * Ne lève jamais. À lancer sans attendre (`void`) : elle ne doit retarder aucun écran.
 */
export async function demanderLaPersistance(
  stockage: Stockage | undefined = stockageDuNavigateur(),
): Promise<boolean> {
  try {
    if (stockage === undefined) return false;
    if (await stockage.persisted()) return true;
    return await stockage.persist();
  } catch {
    return false;
  }
}
