import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase';
import type { ChangeRecord, Snapshot } from './lib/supabase';
import './index.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function parseFieldLabel(field: string): string {
  const parts = field.split('.');
  if (parts[0] === 'machine') {
    const name = (parts[1] ?? '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const attr = parts[2] === 'price_vista' ? 'Preço à vista'
      : parts[2] === 'price_parcelado' ? 'Preço parcelado' : (parts[2] ?? '');
    return `${name} — ${attr}`;
  }
  if (parts[0] === 'rate') return 'Taxa — ' + (parts[1] ?? '').replace(/_/g, ' ').replace('|', ' › ');
  if (parts[0] === 'promo') return 'Promoção detectada';
  return field;
}

function getChangeType(field: string): 'machine' | 'rate' | 'promo' | 'other' {
  if (field.startsWith('machine')) return 'machine';
  if (field.startsWith('rate')) return 'rate';
  if (field.startsWith('promo')) return 'promo';
  return 'other';
}

const TYPE_ICONS  = { machine: '🖥️', rate: '📊', promo: '📢', other: '🔔' };

// ─── Root ─────────────────────────────────────────────────────────────────────

type Page = 'dashboard' | 'historico';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [changes, setChanges]           = useState<ChangeRecord[]>([]);
  const [snapshot, setSnapshot]         = useState<Snapshot | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading]           = useState(true);
  const [snapTab, setSnapTab]           = useState<'machines' | 'rates' | 'promos'>('rates');

  const load = useCallback(async () => {
    const [changesRes, snapRes, allSnapsRes] = await Promise.all([
      supabase.from('ton_changes').select('*').order('detected_at', { ascending: false }).limit(50),
      supabase.from('ton_snapshots').select('*').order('captured_at', { ascending: false }).limit(1).single(),
      supabase.from('ton_snapshots')
        .select('id, captured_at, machines, rates, promotions')
        .order('captured_at', { ascending: false })
        .limit(200),
    ]);
    if (changesRes.data) setChanges(changesRes.data);
    if (snapRes.data)   setSnapshot(snapRes.data);
    if (allSnapsRes.data) setAllSnapshots(allSnapsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 120_000); return () => clearInterval(id); }, [load]);

  const totalSnaps = allSnapshots.length;
  const machines   = snapshot?.machines ?? [];
  const rates      = snapshot?.rates ?? [];
  const promotions = snapshot?.promotions ?? [];

  const uniqueMachines = machines.filter((m, i, arr) =>
    arr.findIndex(x => x.name === m.name) === i && /T[1-4]/i.test(m.name)
  );
  const uniqueRates = rates.filter((r, i, arr) =>
    arr.findIndex(x => x.category === r.category && x.plan === r.plan) === i
  );

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-icon">🕵️</div>
              <div className="logo-text">
                <div className="logo-title">Monitor Ton</div>
                <div className="logo-sub">Vigilância automática · 45min</div>
              </div>
            </div>

            <nav className="nav-tabs" role="tablist">
              <button
                role="tab" aria-selected={page === 'dashboard'}
                className={`nav-tab ${page === 'dashboard' ? 'active' : ''}`}
                onClick={() => setPage('dashboard')}
              >
                📊 Dashboard
              </button>
              <button
                role="tab" aria-selected={page === 'historico'}
                className={`nav-tab ${page === 'historico' ? 'active' : ''}`}
                onClick={() => setPage('historico')}
              >
                🗓️ Histórico
                {totalSnaps > 0 && (
                  <span style={{
                    background: 'rgba(255,255,255,0.2)', borderRadius: '99px',
                    padding: '0 6px', fontSize: '0.65rem',
                  }}>
                    {totalSnaps}
                  </span>
                )}
              </button>
            </nav>

            <div className="header-right">
              {snapshot && (
                <span className="last-check">{timeAgo(snapshot.captured_at)}</span>
              )}
              <div className="live-badge">
                <div className="live-dot" />
                Ao vivo
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">
        <div className="container">
          {page === 'dashboard' && (
            <DashboardPage
              loading={loading}
              changes={changes}
              snapshot={snapshot}
              uniqueMachines={uniqueMachines}
              uniqueRates={uniqueRates}
              promotions={promotions}
              totalSnaps={totalSnaps}
              snapTab={snapTab}
              setSnapTab={setSnapTab}
            />
          )}
          {page === 'historico' && (
            <HistoricoPage
              loading={loading}
              allSnapshots={allSnapshots}
              changes={changes}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function DashboardPage({
  loading, changes, snapshot, uniqueMachines, uniqueRates, promotions,
  totalSnaps, snapTab, setSnapTab,
}: {
  loading: boolean;
  changes: ChangeRecord[];
  snapshot: Snapshot | null;
  uniqueMachines: { name: string; price_vista: string | null; price_parcelado: string | null }[];
  uniqueRates: { plan: string; category: string; rate: string }[];
  promotions: { text: string; location: string }[];
  totalSnaps: number;
  snapTab: 'machines' | 'rates' | 'promos';
  setSnapTab: (t: 'machines' | 'rates' | 'promos') => void;
}) {
  return (
    <div className="page">
      {/* Stats */}
      <div className="stats-grid">
        <StatCard icon="🔄" value={totalSnaps} label="Checagens realizadas" trend="a cada 45min" />
        <StatCard icon="🚨" value={changes.length} label="Mudanças detectadas" trend="últimas 50" />
        <StatCard icon="🖥️" value={uniqueMachines.length || '—'} label="Maquininhas" trend="T1 · T2 · T3 · T4" />
        <StatCard icon="📊" value={uniqueRates.length} label="Taxas monitoradas" trend="todos os planos" />
      </div>

      {/* 2-col grid */}
      <div className="main-grid">
        {/* Feed */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">🚨 Feed de Mudanças</div>
            <span className="panel-count">{changes.length} registros</span>
          </div>
          <div className="panel-body">
            {loading ? (
              <div className="loading"><div className="spinner" /> Carregando...</div>
            ) : changes.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">✅</div>
                Nenhuma mudança detectada ainda.<br />O monitor está de olho!
              </div>
            ) : changes.map(c => {
              const type = getChangeType(c.field);
              return (
                <div key={c.id} className="change-item">
                  <div className={`change-icon ${type}`}>{TYPE_ICONS[type]}</div>
                  <div className="change-body">
                    <div className="change-label">{parseFieldLabel(c.field)}</div>
                    <div className="change-diff">
                      {c.old_value !== '(não existia)' && (
                        <><span className="val-old">{c.old_value.slice(0, 55)}</span>
                        <span className="val-arrow">→</span></>
                      )}
                      <span className="val-new">{c.new_value.slice(0, 55)}</span>
                    </div>
                    <div className="change-meta">
                      <span className="change-time">{formatTime(c.detected_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Estado atual */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">📡 Estado Atual</div>
            {snapshot && <span className="panel-count">{formatTime(snapshot.captured_at)}</span>}
          </div>
          <div className="snap-tabs">
            {(['machines', 'rates', 'promos'] as const).map(tab => (
              <button
                key={tab}
                className={`snap-tab ${snapTab === tab ? 'active' : ''}`}
                onClick={() => setSnapTab(tab)}
              >
                {tab === 'machines' ? '🖥️ Máquinas' : tab === 'rates' ? '📊 Taxas' : '📢 Promos'}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <>
                {snapTab === 'machines' && (
                  <div className="snap-body">
                    {uniqueMachines.length === 0 ? (
                      <div className="empty"><div className="empty-icon">🖥️</div>Aguardando próxima checagem</div>
                    ) : uniqueMachines.map((m, i) => (
                      <div key={i} className="machine-card">
                        <div className="machine-name">{m.name}</div>
                        <div className="machine-prices">
                          {m.price_vista
                            ? <span className="price-tag vista">{m.price_vista}</span>
                            : <span className="price-tag empty">—</span>}
                          {m.price_parcelado && (
                            <span className="price-tag parcelado">{m.price_parcelado}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {snapTab === 'rates' && (
                  <div>
                    {uniqueRates.length === 0 ? (
                      <div className="empty"><div className="empty-icon">📊</div>Sem dados</div>
                    ) : uniqueRates.slice(0, 30).map((r, i) => (
                      <div key={i} className="rate-row">
                        <div className="rate-info">
                          <span className="rate-category">{r.category}</span>
                          {r.plan && <span className="rate-plan-badge">{r.plan.slice(0, 14)}</span>}
                        </div>
                        <span className="rate-value">{r.rate}</span>
                      </div>
                    ))}
                  </div>
                )}

                {snapTab === 'promos' && (
                  <div>
                    {promotions.length === 0 ? (
                      <div className="empty"><div className="empty-icon">📢</div>Sem promoções</div>
                    ) : promotions.slice(0, 8).map((p, i) => (
                      <div key={i} className="promo-item">
                        <div className="promo-location">{p.location}</div>
                        <div className="promo-text">{p.text.slice(0, 130)}{p.text.length > 130 ? '…' : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Histórico Page ───────────────────────────────────────────────────────────

function HistoricoPage({
  loading, allSnapshots, changes,
}: {
  loading: boolean;
  allSnapshots: Snapshot[];
  changes: ChangeRecord[];
}) {
  const total     = allSnapshots.length;
  const comDados  = allSnapshots.filter(s => (s.rates?.length ?? 0) > 0).length;

  return (
    <div className="history-page">
      {/* Mini stats */}
      <div className="history-hero">
        <StatCard icon="🔄" value={total} label="Checagens totais" trend="últimas 200" />
        <StatCard icon="✅" value={comDados} label="Com taxas capturadas" trend={`${Math.round(comDados/Math.max(total,1)*100)}% de sucesso`} />
        <StatCard icon="🚨" value={changes.length} label="Mudanças registradas" trend="histórico completo" />
      </div>

      {/* Table */}
      <div className="history-panel">
        <div className="panel-header">
          <div className="panel-title">🗓️ Registro de Checagens</div>
          <span className="panel-count">{total} entradas</span>
        </div>
        <div className="history-table-wrap">
          {loading ? (
            <div className="loading"><div className="spinner" /> Carregando...</div>
          ) : allSnapshots.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🗓️</div>
              Nenhuma checagem registrada ainda.<br />Aguarde o próximo ciclo!
            </div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Data / Hora</th>
                  <th>Tempo atrás</th>
                  <th>🖥️ Máquinas</th>
                  <th>📊 Taxas</th>
                  <th>📢 Promos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allSnapshots.map((s, i) => (
                  <tr key={s.id} className={i === 0 ? 'row-latest' : ''}>
                    <td className="row-num">{total - i}</td>
                    <td className="row-time">{formatTime(s.captured_at)}</td>
                    <td className="row-ago">{timeAgo(s.captured_at)}</td>
                    <td className="row-count">
                      <span className={`count-badge ${(s.machines?.length ?? 0) > 0 ? 'ok' : 'zero'}`}>
                        {s.machines?.length ?? 0}
                      </span>
                    </td>
                    <td className="row-count">
                      <span className={`count-badge ${(s.rates?.length ?? 0) > 0 ? 'ok' : 'zero'}`}>
                        {s.rates?.length ?? 0}
                      </span>
                    </td>
                    <td className="row-count">
                      <span className={`count-badge ${(s.promotions?.length ?? 0) > 0 ? 'ok' : 'zero'}`}>
                        {s.promotions?.length ?? 0}
                      </span>
                    </td>
                    <td className="row-status">
                      {i === 0
                        ? <span className="status-badge latest">Mais recente</span>
                        : <span className="status-badge ok">OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, trend }: {
  icon: string; value: number | string; label: string; trend?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <div className="stat-icon-wrap">{icon}</div>
        {trend && <span className="stat-trend">{trend}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
