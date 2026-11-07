/*
 * Zod sans compilation à la volée. Pour valider plus vite, zod 4 compile ses schémas d'objets avec
 * `Function`, après avoir essayé `Function('')` pour savoir s'il en a le droit. La politique de
 * sécurité du contenu du serveur le lui interdit (`script-src 'self'`, sans `'unsafe-eval'`, R37) :
 * zod valide alors sans compiler, mais le navigateur signale une violation à chaque chargement.
 * On le lui dit avant qu'il ne construise le moindre schéma : ce module est importé le premier par
 * la page (`main.tsx`) et par le service worker (`sw.ts`). Le serveur, lui, garde la compilation.
 */
import { z } from 'zod';

z.config({ jitless: true });
