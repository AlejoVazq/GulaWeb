CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"horario_desde" time,
	"horario_hasta" time
);
--> statement-breakpoint
CREATE TABLE "grupos_opciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"producto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"min" integer DEFAULT 0 NOT NULL,
	"max" integer DEFAULT 1 NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "grupos_min_max" CHECK ("grupos_opciones"."min" >= 0 and "grupos_opciones"."max" >= 1 and "grupos_opciones"."min" <= "grupos_opciones"."max")
);
--> statement-breakpoint
CREATE TABLE "opciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"grupo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"recargo" integer DEFAULT 0 NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "opciones_recargo_positivo" CHECK ("opciones"."recargo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"categoria_id" uuid NOT NULL,
	"sector_id" uuid,
	"nombre" text NOT NULL,
	"descripcion" text,
	"precio" integer NOT NULL,
	"foto" text,
	"disponible" boolean DEFAULT true NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"etiquetas" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "productos_precio_positivo" CHECK ("productos"."precio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sectores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_opciones" ADD CONSTRAINT "grupos_opciones_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_opciones" ADD CONSTRAINT "grupos_opciones_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opciones" ADD CONSTRAINT "opciones_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opciones" ADD CONSTRAINT "opciones_grupo_id_grupos_opciones_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_opciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_sector_id_sectores_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectores" ADD CONSTRAINT "sectores_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorias_local_idx" ON "categorias" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "grupos_producto_idx" ON "grupos_opciones" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "opciones_grupo_idx" ON "opciones" USING btree ("grupo_id");--> statement-breakpoint
CREATE INDEX "productos_categoria_idx" ON "productos" USING btree ("categoria_id");