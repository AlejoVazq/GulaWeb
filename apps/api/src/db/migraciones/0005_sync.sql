CREATE TABLE "operaciones_aplicadas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"resultado" jsonb NOT NULL,
	"aplicada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operaciones_aplicadas" ADD CONSTRAINT "operaciones_aplicadas_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;