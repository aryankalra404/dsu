// Config comes only from .env.local (see ../.env.example). Defaults point at a core on this machine.
export const CORE_BASE_URL = (process.env.NEXT_PUBLIC_CORE_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
export const CORE_WS_URL = (process.env.NEXT_PUBLIC_CORE_WS_URL || CORE_BASE_URL.replace(/^http/, "ws")).replace(
  /\/$/,
  "",
);
