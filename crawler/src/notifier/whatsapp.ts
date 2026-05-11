import axios from 'axios';
import { ChangeRecord } from '../db/supabase';

// ─── Notificação via Telegram Bot API (oficial) ───────────────────────────────

export async function notifyTelegram(changes: ChangeRecord[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Notifier] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados. Pulando notificação.');
    return;
  }

  const message = buildMessage(changes);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }, { timeout: 15000 });

    console.log('[Notifier] ✅ Notificação Telegram enviada!');
  } catch (err) {
    console.error('[Notifier] ❌ Falha ao enviar Telegram:', (err as Error).message);
  }
}

// ─── Monta a mensagem do Telegram ─────────────────────────────────────────────

function buildMessage(changes: ChangeRecord[]): string {
  const lines: string[] = [];
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  lines.push('🔔 *Monitor Ton — Mudança Detectada\\!*');
  lines.push(`📅 ${now}`);
  lines.push('');

  // Agrupa por tipo para ficar organizado
  const machines = changes.filter(c => c.field.startsWith('machine.'));
  const rates    = changes.filter(c => c.field.startsWith('rate.'));
  const promos   = changes.filter(c => c.field.startsWith('promo.'));

  if (machines.length > 0) {
    lines.push('🖥️ *Maquininhas*');
    for (const c of machines) {
      const label = formatMachineLabel(c.field);
      lines.push(`  • ${label}: ~~${c.old_value}~~ → *${c.new_value}*`);
    }
    lines.push('');
  }

  if (rates.length > 0) {
    lines.push('📊 *Taxas*');
    for (const c of rates) {
      const label = formatRateLabel(c.field);
      lines.push(`  • ${label}: ~~${c.old_value}~~ → *${c.new_value}*`);
    }
    lines.push('');
  }

  if (promos.length > 0) {
    lines.push('📢 *Promoções*');
    for (const c of promos) {
      if (c.new_value === '(removida)') {
        lines.push(`  • Removida: _${c.old_value.slice(0, 80)}..._`);
      } else {
        lines.push(`  • Nova: _${c.new_value.slice(0, 80)}..._`);
      }
    }
    lines.push('');
  }

  lines.push('_Veja o histórico completo no painel\\._');
  return lines.join('\n');
}

// ─── Formata labels legíveis ──────────────────────────────────────────────────

function formatMachineLabel(field: string): string {
  // "machine.t3_smart.price_vista" → "T3 Smart – Preço à vista"
  const parts = field.split('.');
  const name = (parts[1] ?? '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const attr = parts[2] === 'price_vista'
    ? 'Preço à vista'
    : parts[2] === 'price_parcelado'
    ? 'Preço parcelado'
    : (parts[2] ?? '');
  return `${name} – ${attr}`;
}

function formatRateLabel(field: string): string {
  // "rate.at_r_3_mil|credito_12x" → "Até R$3mil – Crédito 12x"
  const raw = field.replace('rate.', '').replace(/_/g, ' ');
  return raw.split('|').map(s => s.trim()).join(' – ');
}
