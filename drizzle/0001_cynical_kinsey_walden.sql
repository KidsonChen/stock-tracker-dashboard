CREATE TABLE `analysisCache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`analysisType` varchar(50) NOT NULL,
	`result` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysisCache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockData` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`date` timestamp NOT NULL,
	`open` decimal(10,2),
	`high` decimal(10,2),
	`low` decimal(10,2),
	`close` decimal(10,2),
	`volume` text,
	`cachedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockData_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`)
);
