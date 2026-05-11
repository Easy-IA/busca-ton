import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TonSnapshot } from '../scrapers/ton';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChangeRecord {
  field: string;        // ex: "machine.T3_Smart.price"
  old_value: string;
  new_value: string;
}

// ─── Supabase client (lazy singleton) ─────────────────────────────────────────

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar no .env');
    }

    _client = createClient(url, key);
  }
  return _client;
}

// ─── Snapshot storage ─────────────────────────────────────────────────────────

export async function saveSnapshot(snapshot: TonSnapshot): Promise<void> {
  const client = getClient();

  const { error } = await client.from('ton_snapshots').insert({
    captured_at: snapshot.timestamp,
    machines: snapshot.machines,
    rates: snapshot.rates,
    promotions: snapshot.promotions,
  });

  if (error) throw new Error(`Erro ao salvar snapshot: ${error.message}`);
  console.log('[DB] Snapshot salvo com sucesso.');
}

// ─── Get last snapshot ────────────────────────────────────────────────────────

export async function getLastSnapshot(): Promise<TonSnapshot | null> {
  const client = getClient();

  const { data, error } = await client
    .from('ton_snapshots')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // "PGRST116" = nenhuma linha encontrada, não é erro real
    if (error.code === 'PGRST116') return null;
    throw new Error(`Erro ao buscar último snapshot: ${error.message}`);
  }

  return {
    timestamp: data.captured_at,
    machines: data.machines ?? [],
    rates: data.rates ?? [],
    promotions: data.promotions ?? [],
  };
}

// ─── Save change record ────────────────────────────────────────────────────────

export async function saveChanges(changes: ChangeRecord[]): Promise<void> {
  if (changes.length === 0) return;

  const client = getClient();

  const rows = changes.map(c => ({
    detected_at: new Date().toISOString(),
    field: c.field,
    old_value: c.old_value,
    new_value: c.new_value,
  }));

  const { error } = await client.from('ton_changes').insert(rows);
  if (error) throw new Error(`Erro ao salvar mudanças: ${error.message}`);
  console.log(`[DB] ${changes.length} mudança(s) registrada(s).`);
}
