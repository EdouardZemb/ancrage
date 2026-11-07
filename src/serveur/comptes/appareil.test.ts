import { describe, expect, it } from 'vitest';
import { type TypeAppareil, typeAppareil } from './appareil.js';

const CAS: { nom: string; userAgent: string | undefined; attendu: TypeAppareil }[] = [
  {
    nom: 'chrome_sur_pixel',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    attendu: 'Android',
  },
  {
    nom: 'samsung_internet',
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
    attendu: 'Android',
  },
  {
    nom: 'firefox_sur_android',
    userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
    attendu: 'Android',
  },
  {
    nom: 'safari_sur_iphone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    attendu: 'iPhone',
  },
  {
    nom: 'chrome_sur_iphone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
    attendu: 'iPhone',
  },
  {
    nom: 'safari_sur_ipad',
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    attendu: 'iPad',
  },
  {
    nom: 'chrome_sur_windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    attendu: 'Windows',
  },
  {
    nom: 'edge_sur_windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    attendu: 'Windows',
  },
  {
    nom: 'firefox_sur_windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    attendu: 'Windows',
  },
  {
    nom: 'safari_sur_mac',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    attendu: 'Mac',
  },
  {
    nom: 'chrome_sur_mac',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    attendu: 'Mac',
  },
  {
    nom: 'firefox_sur_linux',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    attendu: 'Linux',
  },
  {
    nom: 'firefox_sur_ubuntu',
    userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    attendu: 'Linux',
  },
  {
    nom: 'chromebook',
    userAgent:
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    attendu: 'autre',
  },
  { nom: 'curl', userAgent: 'curl/8.7.1', attendu: 'autre' },
  { nom: 'user_agent_vide', userAgent: '', attendu: 'autre' },
  { nom: 'user_agent_absent', userAgent: undefined, attendu: 'autre' },
];

describe('typeAppareil', () => {
  it.each(CAS)('$nom', ({ userAgent, attendu }) => {
    expect(typeAppareil(userAgent)).toBe(attendu);
  });
});
