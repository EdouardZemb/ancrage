import { lireConfig } from './config.js';
import { lancerLEntree } from './demarrage.js';

process.exitCode = await lancerLEntree(lireConfig(process.env), console.error);
