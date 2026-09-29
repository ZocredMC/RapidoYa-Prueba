// Configuración de Supabase
export const SUPABASE_URL = 'https://mzzhpqnaarmnzowijoun.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_0jik7yabOFeMos2rv2MAVQ_TdfJPtVz';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Datos del Negocio
export const NUMERO_WHATSAPP = "573180505095";

// Algoritmo de Tarifas
export const TARIFA_BASE_MINIMA = 4000; // Hasta 2 km
export const COSTO_KM_ADICIONAL_URBANO = 1000; // Por km adicional (2-6 km)
export const TARIFA_BASE_INTERMUNICIPAL = 8000;
export const COSTO_KM_INTERMUNICIPAL = 1800; // Por km adicional (>6 km)
