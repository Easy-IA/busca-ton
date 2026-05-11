import { chromium, Browser, Page } from 'playwright';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TonSnapshot {
  timestamp: string;
  machines: MachineData[];
  rates: RateData[];
  promotions: PromotionData[];
}

export interface MachineData {
  name: string;         // ex: "T3 Smart"
  price_vista: string | null;    // ex: "R$ 191,88"
  price_parcelado: string | null; // ex: "12x R$ 15,99"
}

export interface RateData {
  plan: string;         // ex: "Até R$ 3 mil"
  category: string;     // ex: "Débito", "Crédito à vista", "Crédito 12x"
  rate: string;         // ex: "0,99%"
}

export interface PromotionData {
  text: string;
  location: string;     // ex: "banner_principal", "ticker"
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

export async function scrapeTon(): Promise<TonSnapshot> {
  console.log('[Ton Crawler] Iniciando navegador...');

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Bloqueia recursos desnecessários para economizar memória e acelerar
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => route.abort());
    await page.route('**/{analytics,gtag,fbq,hotjar}*', route => route.abort());

    // ── 1. Máquinas e preços (página principal) ────────────────────────────
    await page.goto('https://www.ton.com.br/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('[Ton Crawler] Página principal carregada.');

    const [machines, promotions] = await Promise.all([
      extractMachines(page),
      extractPromotions(page),
    ]);

    // ── 2. Taxas (página dedicada de planos e taxas) ────────────────────────
    await page.goto('https://www.ton.com.br/planos-e-taxas', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('[Ton Crawler] Página de taxas carregada.');

    const rates = await extractRates(page);

    const snapshot: TonSnapshot = {
      timestamp: new Date().toISOString(),
      machines,
      rates,
      promotions,
    };

    console.log(
      `[Ton Crawler] Concluído. Máquinas: ${machines.length} | Taxas: ${rates.length} | Promoções: ${promotions.length}`
    );

    return snapshot;
  } finally {
    await browser.close();
  }
}

// ─── Extratores ───────────────────────────────────────────────────────────────

async function extractMachines(page: Page): Promise<MachineData[]> {
  console.log('[Ton Crawler] Extraindo máquinas e preços...');

  // Aguarda os cards de máquinas aparecerem
  await page.waitForSelector('.snap-center', { timeout: 15000 }).catch(() => null);

  return page.evaluate(() => {
    const results: { name: string; price_vista: string | null; price_parcelado: string | null }[] = [];
    const seen = new Set<string>();

    const cards = document.querySelectorAll('div.snap-center');

    cards.forEach(card => {
      // Nome da máquina: h6 (ex: "T3 Smart", "T3", "T2", "T1")
      const nameEl = card.querySelector('h6');
      const rawName = nameEl?.textContent?.trim() ?? '';
      if (!rawName || !/T[1-4]/i.test(rawName)) return;

      const name = rawName.replace(/\s+/g, ' ').trim();
      if (seen.has(name)) return;
      seen.add(name);

      // Preço à vista: p com classes text-brand e font-bold (preço com desconto em verde)
      const vistaEl = card.querySelector('p.text-brand.font-bold');
      const price_vista = vistaEl?.textContent?.trim() ?? null;

      // Preço parcelado: a div.flex.text-brand contém os dígitos separados
      // Ou busca por texto com "x de R$" no card inteiro
      const cardText = card.textContent ?? '';
      const parceladoMatch = cardText.match(/\d{1,2}x\s*(?:de\s*)?R\$\s*[\d.,]+/i);
      const price_parcelado = parceladoMatch ? parceladoMatch[0].trim() : null;

      results.push({ name, price_vista, price_parcelado });
    });

    return results;
  });
}


async function extractRates(page: Page): Promise<RateData[]> {
  console.log('[Ton Crawler] Extraindo taxas de todos os planos...');
  const allRates: RateData[] = [];

  // Aguarda o select de planos aparecer
  await page.waitForSelector('select#P0-2', { timeout: 15000 }).catch(() => null);

  // Pega todas as opções do select de planos
  const planOptions = await page.evaluate(() => {
    const select = document.querySelector('select#P0-2') as HTMLSelectElement | null;
    if (!select) return [] as { value: string; label: string }[];
    return Array.from(select.options).map(o => ({ value: o.value, label: o.text.trim() }));
  });

  if (planOptions.length === 0) {
    // Fallback: extrai taxas do estado atual da página
    const rates = await extractRatesFromPage(page, 'Padrão');
    allRates.push(...rates);
  } else {
    for (const option of planOptions) {
      try {
        // O select é controlado por React — usa dispatchEvent para simular mudança
        await page.evaluate((val) => {
          const select = document.querySelector('select#P0-2') as HTMLSelectElement | null;
          if (!select) return;
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value'
          )?.set;
          nativeInputValueSetter?.call(select, val);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }, option.value);

        await page.waitForTimeout(1200);

        const rates = await extractRatesFromPage(page, option.label);
        allRates.push(...rates);
      } catch {
        // Ignora opções que falham e continua
      }
    }
  }

  return allRates;
}

async function extractRatesFromPage(page: Page, planLabel: string): Promise<RateData[]> {
  return page.evaluate((plan) => {
    const results: { plan: string; category: string; rate: string }[] = [];
    const seen = new Set<string>();

    // Linhas de taxa: div com layout de 2 colunas (label | valor)
    const rows = document.querySelectorAll(
      'div.flex.justify-between'
    );

    rows.forEach(row => {
      const paras = row.querySelectorAll('p');
      if (paras.length < 2) return;

      const label = paras[0].textContent?.trim() ?? '';
      const value = paras[paras.length - 1].textContent?.trim() ?? '';

      // Valida que o valor é uma porcentagem
      if (!/\d[.,]\d+\s*%/.test(value)) return;
      // Ignora labels vazios
      if (!label || label.length > 60) return;

      const key = `${plan}|${label}|${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ plan, category: label, rate: value });
      }
    });

    return results;
  }, planLabel);
}

async function extractPromotions(page: Page): Promise<PromotionData[]> {
  console.log('[Ton Crawler] Extraindo promoções e banners...');

  return page.evaluate(() => {
    const promos: { text: string; location: string }[] = [];
    const seen = new Set<string>();

    // Banner principal / Hero
    const hero = document.querySelector('section h1');
    if (hero) {
      const text = hero.textContent?.trim().replace(/\s+/g, ' ') ?? '';
      if (text && !seen.has(text)) {
        seen.add(text);
        promos.push({ text, location: 'banner_principal' });
      }
    }

    // Ticker/marquee no topo
    const tickers = document.querySelectorAll('[class*="ticker"], [class*="marquee"], [class*="scroll"]');
    tickers.forEach(el => {
      const text = el.textContent?.trim().replace(/\s+/g, ' ') ?? '';
      if (text.length > 5 && text.length < 300 && !seen.has(text)) {
        seen.add(text);
        promos.push({ text, location: 'ticker' });
      }
    });

    // Banners e destaques gerais
    const highlights = document.querySelectorAll('[class*="banner"], [class*="promo"], [class*="destaque"]');
    highlights.forEach(el => {
      const text = el.textContent?.trim().replace(/\s+/g, ' ') ?? '';
      if (text.length > 10 && text.length < 300 && !seen.has(text)) {
        seen.add(text);
        promos.push({ text, location: 'destaque' });
      }
    });

    return promos;
  });
}
