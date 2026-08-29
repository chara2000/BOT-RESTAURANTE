-- Migration: 020 - Multi-tenant bot credentials (Telegram + WhatsApp/YCloud)
-- Each tenant configures their own bot tokens independently via the settings panel.

ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT DEFAULT NULL,  -- UUID used as the webhook path segment
  ADD COLUMN IF NOT EXISTS telegram_admin_chat_id  TEXT DEFAULT NULL,  -- Per-tenant admin Telegram ID
  ADD COLUMN IF NOT EXISTS ycloud_api_key          TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ycloud_phone_number     TEXT DEFAULT NULL,  -- WhatsApp number registered with YCloud
  ADD COLUMN IF NOT EXISTS ycloud_webhook_secret   TEXT DEFAULT NULL;  -- Token to verify YCloud webhook signatures

-- Migrate existing env-var bot to the demo tenant so legacy bot keeps working.
-- The value is intentionally left empty here — the system will fall back to
-- TELEGRAM_BOT_TOKEN env var when telegram_bot_token IS NULL.
-- Admins can update their row from the UI.

COMMENT ON COLUMN public.tenant_settings.telegram_bot_token IS
  'Token from @BotFather. Overrides the global TELEGRAM_BOT_TOKEN env var for this tenant.';
COMMENT ON COLUMN public.tenant_settings.telegram_webhook_secret IS
  'Auto-generated UUID used as the URL path for the Telegram webhook endpoint. Never expose the real bot token in URLs.';
COMMENT ON COLUMN public.tenant_settings.telegram_admin_chat_id IS
  'Telegram chat ID of the restaurant admin. Used to forward customer messages.';
COMMENT ON COLUMN public.tenant_settings.ycloud_api_key IS
  'YCloud API key for sending WhatsApp messages from this tenant number.';
COMMENT ON COLUMN public.tenant_settings.ycloud_phone_number IS
  'WhatsApp phone number registered in YCloud (e.g. +573001234567).';
COMMENT ON COLUMN public.tenant_settings.ycloud_webhook_secret IS
  'Secret token configured in YCloud to verify incoming webhook POST bodies.';
