import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChangeRecord {
  id: number;
  detected_at: string;
  field: string;
  old_value: string;
  new_value: string;
}

export interface MachineData {
  name: string;
  price_vista: string | null;
  price_parcelado: string | null;
}

export interface RateData {
  plan: string;
  category: string;
  rate: string;
}

export interface PromotionData {
  text: string;
  location: string;
}

export interface Snapshot {
  id: number;
  captured_at: string;
  machines: MachineData[];
  rates: RateData[];
  promotions: PromotionData[];
}
