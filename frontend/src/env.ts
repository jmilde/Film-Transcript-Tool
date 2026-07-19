// Runtime configuration, read once from Vite's import.meta.env. Fallbacks keep
// tests and local dev working without a .env; real values come from .env in dev
// and the build environment in production.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'public-anon-key'
