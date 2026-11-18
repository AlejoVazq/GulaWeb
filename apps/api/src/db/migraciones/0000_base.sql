CREATE TABLE "locales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"marca" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locales_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"rol" text NOT NULL,
	"email" text,
	"password_hash" text,
	"pin_hash" text NOT NULL,
	"pin_fallos" integer DEFAULT 0 NOT NULL,
	"pin_bloqueado_hasta" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_rol_valido" CHECK ("usuarios"."rol" in ('dueno','encargado','mesero'))
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"familia" uuid NOT NULL,
	"hash" text NOT NULL,
	"usado_en" timestamp with time zone,
	"revocado" boolean DEFAULT false NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	CONSTRAINT "refresh_tokens_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"autorizado_por" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"antes" jsonb,
	"despues" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_familia_idx" ON "refresh_tokens" USING btree ("familia");--> statement-breakpoint
CREATE INDEX "auditoria_local_fecha_idx" ON "auditoria" USING btree ("local_id","creado_en");