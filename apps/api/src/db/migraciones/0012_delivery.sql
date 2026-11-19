CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"pedido_id" uuid NOT NULL,
	"cliente_nombre" text NOT NULL,
	"telefono" text DEFAULT '' NOT NULL,
	"direccion" text NOT NULL,
	"referencias" text DEFAULT '' NOT NULL,
	"costo_envio" bigint DEFAULT 0 NOT NULL,
	"paga_con" bigint,
	"repartidor" text,
	"estado" text NOT NULL,
	"en_camino_en" timestamp with time zone,
	"entregado_en" timestamp with time zone,
	CONSTRAINT "deliveries_pedido_id_unique" UNIQUE("pedido_id"),
	CONSTRAINT "deliveries_estado" CHECK ("deliveries"."estado" in ('preparando', 'en_camino', 'entregado')),
	CONSTRAINT "deliveries_envio" CHECK ("deliveries"."costo_envio" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_origen";--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_local_idx" ON "deliveries" USING btree ("local_id");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_origen" CHECK ("pedidos"."origen" in ('qr', 'manual', 'mostrador', 'delivery'));