export type Environnement = 'dev' | 'ci' | 'staging' | 'prod';

export interface ReponseSante {
  statut: 'ok';
  environnement: Environnement;
  version: string;
  revision: string;
  schema: number;
  instance: string;
}
