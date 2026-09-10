# Stall runbooks

Operational playbooks for on-call. Each file: **symptom → triage → mitigation → follow-up**.

| runbook | when |
|---|---|
| [on-call.md](on-call.md) | shift handover, dashboards, escalation ladder |
| [incident.md](incident.md) | any user-visible outage — declare, comms, roles |
| [deploy-rollback.md](deploy-rollback.md) | a bad revision is live |
| [payment-outage.md](payment-outage.md) | gateway errors / stuck `PaymentIntent`s |
| [dispatch-degradation.md](dispatch-degradation.md) | deliveries not getting couriers |
| [dispute-surge.md](dispute-surge.md) | dispute / support queue blows the SLA |
| [disaster-recovery.md](disaster-recovery.md) | Cloud SQL loss / region failure |

Dashboards: Grafana `stall-overview` (OTLP), Cloud Run metrics, Cloud SQL insights,
Sentry `stall-*` projects. Alert routing: PagerDuty `stall-primary`.
