CREATE TABLE "cobros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"turno_id" uuid NOT NULL,
	"sesion_id" uuid,
	"pedido_id" uuid,
	"subtotal" integer NOT NULL,
	"descuento" integer DEFAULT 0 NOT NULL,
	"motivo_descuento" text,
	"total" integer NOT NULL,
	"cobrado_por" uuid NOT NULL,
	"cobrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobros_destino" CHECK (("cobros"."sesion_id" is null) <> ("cobros"."pedido_id" is null)),
	CONSTRAINT "cobros_montos" CHECK ("cobros"."descuento" >= 0 and "cobros"."descuento" <= "cobros"."subtotal" and "cobros"."total" = "cobros"."subtotal" - "cobros"."descuento")
);
--> statement-breakpoint
CREATE TABLE "movimientos_caja" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"turno_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"categoria" text NOT NULL,
	"monto" integer NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hecho_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_tipo" CHECK ("movimientos_caja"."tipo" in ('ingreso', 'egreso')),
	CONSTRAINT "movimientos_categoria" CHECK ("movimientos_caja"."categoria" in ('proveedores', 'sueldos', 'retiro', 'otro')),
	CONSTRAINT "movimientos_monto" CHECK ("movimientos_caja"."monto" > 0)
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"cobro_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"metodo" text NOT NULL,
	"monto" integer NOT NULL,
	"propina" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pagos_metodo" CHECK ("pagos"."metodo" in ('efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro')),
	CONSTRAINT "pagos_montos" CHECK ("pagos"."monto" > 0 and "pagos"."propina" >= 0)
);
--> statement-breakpoint
CREATE TABLE "turnos_caja" (
	"id" uuid PRIMARY KEY NOT NULL,
	"local_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone,
	"abierto_por" uuid NOT NULL,
	"abierto_en" timestamp with time zone DEFAULT now() NOT NULL,
	"fondo" integer NOT NULL,
	"cerrado_por" uuid,
	"cerrado_en" timestamp with time zone,
	"contado" integer,
	"esperado" integer,
	"diferencia" integer,
	"notas" text,
	CONSTRAINT "turnos_fondo" CHECK ("turnos_caja"."fondo" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_estado";--> statement-breakpoint
ALTER TABLE "items_pedido" ADD COLUMN "anulado_por" uuid;--> statement-breakpoint
ALTER TABLE "items_pedido" ADD COLUMN "motivo_anulacion" text;--> statement-breakpoint
ALTER TABLE "items_pedido" ADD COLUMN "anulado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "anulado_por" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "motivo_anulacion" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "anulado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_sesion_id_sesiones_mesa_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones_mesa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cobro_id_cobros_id_fk" FOREIGN KEY ("cobro_id") REFERENCES "public"."cobros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_turno_id_turnos_caja_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobros_turno_idx" ON "cobros" USING btree ("turno_id");--> statement-breakpoint
CREATE INDEX "movimientos_turno_idx" ON "movimientos_caja" USING btree ("turno_id");--> statement-breakpoint
CREATE INDEX "pagos_turno_idx" ON "pagos" USING btree ("turno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_una_abierta" ON "turnos_caja" USING btree ("local_id") WHERE cerrado_en is null;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_estado" CHECK ("pedidos"."estado" in ('pendiente', 'confirmado', 'rechazado', 'anulado', 'cobrado'));