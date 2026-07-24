-- Phase 5 (ADR 0002): UPI-app notification capture. The forwarder POSTs
-- whitelisted-app notifications to the same ingest endpoint; sender holds the
-- Android package name for those rows. RLS on raw_sms already covers them.

alter table raw_sms add column source text not null default 'sms'
  check (source in ('sms', 'app_notification'));
