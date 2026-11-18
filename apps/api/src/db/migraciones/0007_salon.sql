CREATE TABLE "avisos_mesa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"sesion_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"atendido_por" uuid,
	"atendido_en" timestamp with time zone,
	CONSTRAINT "avisos_tipo" CHECK ("avisos_mesa"."tipo" in ('llamar', 'cuenta'))
);
--> statement-breakpoint
CREATE TABLE "items_pedido" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"pedido_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"precio_unitario" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"seleccion" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resumen_opciones" text DEFAULT '' NOT NULL,
	"nota" text DEFAULT '' NOT NULL,
	"sector_id" uuid,
	"anulado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "items_cantidad" CHECK ("items_pedido"."cantidad" between 1 and 50),
	CONSTRAINT "items_precio" CHECK ("items_pedido"."precio_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"nombre" text NOT NULL,
	"zona" text,
	"capacidad" integer,
	"orden" integer DEFAULT 0 NOT NULL,
	"token" text NOT NULL,
	CONSTRAINT "mesas_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"origen" text NOT NULL,
	"estado" text NOT NULL,
	"sesion_id" uuid,
	"mesa_id" uuid,
	"numero" integer,
	"dia" text,
	"notas" text,
	"motivo_rechazo" text,
	"creado_por" uuid,
	"confirmado_por" uuid,
	"confirmado_en" timestamp with time zone,
	"rechazado_en" timestamp with time zone,
	CONSTRAINT "pedidos_origen" CHECK ("pedidos"."origen" in ('qr', 'manual', 'mostrador')),
	CONSTRAINT "pedidos_estado" CHECK ("pedidos"."estado" in ('pendiente', 'confirmado', 'rechazado', 'anulado'))
);
--> statement-breakpoint
CREATE TABLE "sesiones_mesa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"mesa_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"comensales" integer,
	"abierta_por" uuid,
	"abierta_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_por" uuid,
	"cerrada_en" timestamp with time zone,
	CONSTRAINT "sesiones_estado" CHECK ("sesiones_mesa"."estado" in ('abierta', 'cuenta_pedida', 'cerrada'))
);
--> statement-breakpoint
ALTER TABLE "avisos_mesa" ADD CONSTRAINT "avisos_mesa_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos_mesa" ADD CONSTRAINT "avisos_mesa_sesion_id_sesiones_mesa_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones_mesa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_sector_id_sectores_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sesion_id_sesiones_mesa_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones_mesa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_mesa" ADD CONSTRAINT "sesiones_mesa_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_mesa" ADD CONSTRAINT "sesiones_mesa_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avisos_sesion_idx" ON "avisos_mesa" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "items_pedido_idx" ON "items_pedido" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "mesas_local_idx" ON "mesas" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "pedidos_local_idx" ON "pedidos" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "pedidos_sesion_idx" ON "pedidos" USING btree ("sesion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_mesa_una_abierta" ON "sesiones_mesa" USING btree ("mesa_id") WHERE estado <> 'cerrada';--> statement-breakpoint
CREATE INDEX "sesiones_local_idx" ON "sesiones_mesa" USING btree ("local_id");