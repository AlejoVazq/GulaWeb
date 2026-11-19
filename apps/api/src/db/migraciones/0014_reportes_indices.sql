CREATE INDEX "cobros_local_fecha_idx" ON "cobros" USING btree ("local_id","cobrado_en");--> statement-breakpoint
CREATE INDEX "cobros_sesion_idx" ON "cobros" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "cobros_pedido_idx" ON "cobros" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "movimientos_local_fecha_idx" ON "movimientos_caja" USING btree ("local_id","hecho_en");--> statement-breakpoint
CREATE INDEX "pagos_cobro_idx" ON "pagos" USING btree ("cobro_id");