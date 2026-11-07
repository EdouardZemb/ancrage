CREATE TABLE `evenement` (
	`rang` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`personne` text NOT NULL,
	`cours` text NOT NULL,
	`numero` integer NOT NULL,
	`unite` text NOT NULL,
	`type` text NOT NULL,
	`resultat` text NOT NULL,
	`repondu_a` text NOT NULL,
	`appareil` text NOT NULL,
	`v` integer NOT NULL,
	`recu_a` text NOT NULL,
	FOREIGN KEY (`personne`) REFERENCES `personne`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evenement_personne_id` ON `evenement` (`personne`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evenement_personne_cours_numero` ON `evenement` (`personne`,`cours`,`numero`);