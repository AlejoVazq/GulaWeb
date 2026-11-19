ALTER TABLE "cobros" ALTER COLUMN "subtotal" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "cobros" ALTER COLUMN "descuento" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "cobros" ALTER COLUMN "total" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ALTER COLUMN "monto" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "pagos" ALTER COLUMN "monto" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "pagos" ALTER COLUMN "propina" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "turnos_caja" ALTER COLUMN "fondo" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "turnos_caja" ALTER COLUMN "contado" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "turnos_caja" ALTER COLUMN "esperado" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "turnos_caja" ALTER COLUMN "diferencia" SET DATA TYPE bigint;