import { TonSnapshot, MachineData, RateData, PromotionData } from '../scrapers/ton';
import { ChangeRecord } from '../db/supabase';

// ─── Compara dois snapshots e retorna o que mudou ─────────────────────────────

export function diffSnapshots(
  oldSnap: TonSnapshot,
  newSnap: TonSnapshot
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];

  // 1. Compara máquinas
  diffMachines(oldSnap.machines, newSnap.machines, changes);

  // 2. Compara taxas
  diffRates(oldSnap.rates, newSnap.rates, changes);

  // 3. Compara promoções
  diffPromotions(oldSnap.promotions, newSnap.promotions, changes);

  return changes;
}

// ─── Comparadores específicos ─────────────────────────────────────────────────

function diffMachines(
  oldList: MachineData[],
  newList: MachineData[],
  out: ChangeRecord[]
): void {
  const oldMap = new Map(oldList.map(m => [normalize(m.name), m]));
  const newMap = new Map(newList.map(m => [normalize(m.name), m]));

  for (const [key, newM] of newMap) {
    const oldM = oldMap.get(key);

    if (!oldM) {
      // Máquina nova apareceu
      out.push({
        field: `machine.${key}.price_vista`,
        old_value: '(não existia)',
        new_value: newM.price_vista ?? 'N/A',
      });
      continue;
    }

    // Preço à vista mudou?
    if (newM.price_vista !== oldM.price_vista && (newM.price_vista || oldM.price_vista)) {
      out.push({
        field: `machine.${key}.price_vista`,
        old_value: oldM.price_vista ?? 'N/A',
        new_value: newM.price_vista ?? 'N/A',
      });
    }

    // Preço parcelado mudou?
    if (newM.price_parcelado !== oldM.price_parcelado && (newM.price_parcelado || oldM.price_parcelado)) {
      out.push({
        field: `machine.${key}.price_parcelado`,
        old_value: oldM.price_parcelado ?? 'N/A',
        new_value: newM.price_parcelado ?? 'N/A',
      });
    }
  }

  // Máquina sumiu?
  for (const [key] of oldMap) {
    if (!newMap.has(key)) {
      out.push({
        field: `machine.${key}.price_vista`,
        old_value: oldMap.get(key)!.price_vista ?? 'N/A',
        new_value: '(removida do site)',
      });
    }
  }
}

function diffRates(
  oldList: RateData[],
  newList: RateData[],
  out: ChangeRecord[]
): void {
  const key = (r: RateData) => `${normalize(r.plan)}|${normalize(r.category)}`;
  const oldMap = new Map(oldList.map(r => [key(r), r]));
  const newMap = new Map(newList.map(r => [key(r), r]));

  for (const [k, newR] of newMap) {
    const oldR = oldMap.get(k);
    if (!oldR) {
      out.push({
        field: `rate.${k}`,
        old_value: '(nova)',
        new_value: newR.rate,
      });
    } else if (newR.rate !== oldR.rate) {
      out.push({
        field: `rate.${k}`,
        old_value: oldR.rate,
        new_value: newR.rate,
      });
    }
  }

  for (const [k, oldR] of oldMap) {
    if (!newMap.has(k)) {
      out.push({
        field: `rate.${k}`,
        old_value: oldR.rate,
        new_value: '(removida)',
      });
    }
  }
}

function diffPromotions(
  oldList: PromotionData[],
  newList: PromotionData[],
  out: ChangeRecord[]
): void {
  const oldTexts = new Set(oldList.map(p => p.text));
  const newTexts = new Set(newList.map(p => p.text));

  for (const p of newList) {
    if (!oldTexts.has(p.text)) {
      out.push({
        field: `promo.${p.location}`,
        old_value: '(não existia)',
        new_value: p.text.slice(0, 200),
      });
    }
  }

  for (const p of oldList) {
    if (!newTexts.has(p.text)) {
      out.push({
        field: `promo.${p.location}`,
        old_value: p.text.slice(0, 200),
        new_value: '(removida)',
      });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
