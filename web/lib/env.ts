// Config comes only from .env.local (copied from ../.env.example). Never hardcode a URL, IP or key.
export const CORE_BASE_URL = process.env.NEXT_PUBLIC_CORE_BASE_URL ?? "";
export const CORE_WS_URL = process.env.NEXT_PUBLIC_CORE_WS_URL ?? "";
