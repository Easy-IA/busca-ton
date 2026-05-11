import 'dotenv/config';
import { scrapeTon } from './scrapers/ton';
import { saveSnapshot, getLastSnapshot, saveChanges } from './db/supabase';
import { diffSnapshots } from './utils/diff';
import { notifyTelegram } from './notifier/whatsapp';

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log(`[Monitor Ton] Executando em: ${new Date().toLocaleString('pt-BR')}`);
  console.log('='.repeat(50));

  try {
    // 1. Scraping do site
    const newSnapshot = await scrapeTon();

    // 2. Busca o último snapshot no banco
    const lastSnapshot = await getLastSnapshot();

    // 3. Compara
    if (!lastSnapshot) {
      console.log('[Monitor Ton] Primeiro snapshot. Salvando como baseline...');
      await saveSnapshot(newSnapshot);
      console.log('[Monitor Ton] Baseline salvo! Próximas execuções vão detectar mudanças.');
      return;
    }

    const changes = diffSnapshots(lastSnapshot, newSnapshot);

    // 4. Se mudou algo, registra e notifica
    if (changes.length > 0) {
      console.log(`[Monitor Ton] 🚨 ${changes.length} mudança(s) detectada(s)!`);
      changes.forEach(c => {
        console.log(`  • ${c.field}: "${c.old_value}" → "${c.new_value}"`);
      });

      await saveChanges(changes);
      await saveSnapshot(newSnapshot);
      await notifyTelegram(changes);
    } else {
      console.log('[Monitor Ton] ✅ Nenhuma mudança detectada.');
    }

  } catch (err) {
    console.error('[Monitor Ton] ❌ Erro fatal:', (err as Error).message);
    process.exit(1);
  }
}

main();
