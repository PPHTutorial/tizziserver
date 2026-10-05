-- One intent per provider reference: a webhook / verify for a tx_ref can only
-- ever resolve a single intent.
CREATE UNIQUE INDEX "payment_intents_gateway_gatewayRef_key" ON "payment_intents"("gateway", "gatewayRef");

-- Reconcile sweep scans in-flight intents by status, oldest-touched first.
CREATE INDEX "payment_intents_status_updatedAt_idx" ON "payment_intents"("status", "updatedAt");

-- Charge-once backstop below the application's conditional claim: the
-- SUCCEEDED payment row of a gateway-settled intent carries its intent id here,
-- so the database refuses a second success (and a second credit).
ALTER TABLE "payments" ADD COLUMN "settledIntentId" TEXT;
CREATE UNIQUE INDEX "payments_settledIntentId_key" ON "payments"("settledIntentId");
