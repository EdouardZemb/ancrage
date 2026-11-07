CREATE TABLE `autorisation` (
	`id` text PRIMARY KEY NOT NULL,
	`cours` text NOT NULL,
	`permission` text NOT NULL,
	`personne` text,
	`groupe` text,
	`cree_le` text NOT NULL,
	FOREIGN KEY (`personne`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`groupe`) REFERENCES `groupe`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "autorisation_un_seul_sujet" CHECK(("autorisation"."personne" IS NULL) <> ("autorisation"."groupe" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `autorisation_cours_permission_personne` ON `autorisation` (`cours`,`permission`,`personne`) WHERE "autorisation"."personne" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `autorisation_cours_permission_groupe` ON `autorisation` (`cours`,`permission`,`groupe`) WHERE "autorisation"."groupe" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `groupe` (
	`id` text PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`cree_le` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groupe_nom_unique` ON `groupe` (`nom`);--> statement-breakpoint
CREATE TABLE `lien` (
	`empreinte` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`personne` text,
	`proprietaire` integer DEFAULT 0 NOT NULL,
	`octroi` text NOT NULL,
	`cree_par` text,
	`cree_le` text NOT NULL,
	`expire_le` text NOT NULL,
	`utilise_le` text,
	FOREIGN KEY (`personne`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cree_par`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `membre` (
	`groupe` text NOT NULL,
	`personne` text NOT NULL,
	PRIMARY KEY(`groupe`, `personne`),
	FOREIGN KEY (`groupe`) REFERENCES `groupe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`personne`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`personne` text NOT NULL,
	`cle_publique` blob NOT NULL,
	`compteur` integer NOT NULL,
	`transports` text NOT NULL,
	`appareil` text NOT NULL,
	`cree_le` text NOT NULL,
	`utilise_le` text,
	FOREIGN KEY (`personne`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `personne` (
	`id` text PRIMARY KEY NOT NULL,
	`nom_affiche` text NOT NULL,
	`langue` text NOT NULL,
	`proprietaire` integer DEFAULT 0 NOT NULL,
	`cree_le` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`empreinte` text NOT NULL,
	`personne` text NOT NULL,
	`appareil` text NOT NULL,
	`cree_le` text NOT NULL,
	`utilise_le` text NOT NULL,
	`expire_le` text NOT NULL,
	FOREIGN KEY (`personne`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_empreinte_unique` ON `session` (`empreinte`);