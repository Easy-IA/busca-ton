import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase';
import type { ChangeRecord, Snapshot } from './lib/supabase';
import './index.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
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
      : parts[2] === 'price_parcelado' ? 'Preço parcelado'
      : (parts[2] ?? '');
    return `${name} — ${attr}`;
  }
  if (parts[0] === 'rate') {
    return 'Taxa — ' + (parts[1] ?? '').replace(/_/g, ' ').replace('|', ' › ');
  }
  if (parts[0] === 'promo') return 'Promoção';
  return field;
}

function getChangeType(field: string): 'machine' | 'rate' | 'promo' | 'other' {
  if (field.startsWith('machine')) return 'machine';
  if (field.startsWith('rate')) return 'rate';
  if (field.startsWith('promo')) return 'promo';
  return 'other';
}

const TYPE_ICONS = { machine: '🖥️', rate: '📊', promo: '📢', other: '🔔' };

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [changes, setChanges]     = useState<ChangeRecord[]>([]);
  const [snapshot, setSnapshot]   = useState<Snapshot | null>(null);
  const [totalSnaps, setTotalSnaps] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'machines' | 'rates' | 'promos'>('rates');

  const load = useCallback(async () => {
    const [changesRes, snapRes, countRes] = await Promise.all([
      supabase.from('ton_changes').select('*').order('detected_at', { ascending: false }).limit(50),
      supabase.from('ton_snapshots').select('*').order('captured_at', { ascending: false }).limit(1).single(),
      supabase.from('ton_snapshots').select('id', { count: 'exact', head: true }),
    ]);
    if (changesRes.data) setChanges(changesRes.data);
    if (snapRes.data)   setSnapshot(snapRes.data);
    if (countRes.count !== null) setTotalSnaps(countRes.count);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh a cada 2 minutos
  useEffect(() => {
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  const machines  = snapshot?.machines ?? [];
  const rates     = snapshot?.rates ?? [];
  const promotions = snapshot?.promotions ?? [];

  // Máquinas únicas com preço (filtra duplicatas e sem nome útil)
  const uniqueMachines = machines.filter((m, i, arr) =>
    arr.findIndex(x => x.name === m.name) === i && /T[1-4]/i.test(m.name) && m.name.length < 30
  );

  // Taxas únicas
  const uniqueRates = rates.filter((r, i, arr) =>
    arr.findIndex(x => x.category === r.category && x.plan === r.plan) === i
  ).slice(0, 30);

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
                <div className="logo-sub">Vigilância de preços e taxas</div>
              </div>
            </div>
            <div className="header-right">
              {snapshot && (
                <span className="last-check">
                  Última checagem: {timeAgo(snapshot.captured_at)}
                </span>
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

          {/* Stats */}
          <div className="stats-grid">
            <StatCard icon="🔄" value={totalSnaps} label="Checagens realizadas" />
            <StatCard icon="🚨" value={changes.length > 0 ? changes.length + '+' : '0'} label="Mudanças detectadas" />
            <StatCard icon="🖥️" value={uniqueMachines.length} label="Maquininhas monitoradas" />
            <StatCard icon="📊" value={uniqueRates.length} label="Taxas monitoradas" />
          </div>

          {/* Main grid */}
          <div className="main-grid">

            {/* Feed de mudanças */}
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
                    Nenhuma mudança detectada ainda.<br />O monitor está vigilante!
                  </div>
                ) : (
                  changes.map(c => {
                    const type = getChangeType(c.field);
                    return (
                      <div key={c.id} className="change-item">
                        <div className={`change-type-icon ${type}`}>
                          {TYPE_ICONS[type]}
                        </div>
                        <div className="change-content">
                          <div className="change-label">{parseFieldLabel(c.field)}</div>
                          <div className="change-diff">
                            {c.old_value !== '(não existia)' && (
                              <span className="val-old">{c.old_value.slice(0, 60)}</span>
                            )}
                            {c.old_value !== '(não existia)' && (
                              <span className="val-arrow">→</span>
                            )}
                            <span className="val-new">{c.new_value.slice(0, 60)}</span>
                          </div>
                          <div className="change-time">{formatTime(c.detected_at)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Snapshot atual */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">📡 Estado Atual</div>
                {snapshot && (
                  <span className="panel-count">{timeAgo(snapshot.captured_at)}</span>
                )}
              </div>

              <div className="tabs">
                {(['machines', 'rates', 'promos'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'machines' ? '🖥️ Máquinas'
                     : tab === 'rates' ? '📊 Taxas'
                     : '📢 Promos'}
                  </button>
                ))}
              </div>

              <div className="panel-body">
                {loading ? (
                  <div className="loading"><div className="spinner" /></div>
                ) : (
                  <>
                    {activeTab === 'machines' && (
                      <div className="snap-body">
                        {uniqueMachines.length === 0 ? (
                          <div className="empty"><div className="empty-icon">🖥️</div>Sem dados</div>
                        ) : uniqueMachines.map((m, i) => (
                          <div key={i} className="machine-card">
                            <div className="machine-name">{m.name}</div>
                            <div className="machine-prices">
                              {m.price_vista
                                ? <span className="price-tag vista">💰 {m.price_vista}</span>
                                : <span className="price-tag empty">Sem preço à vista</span>}
                              {m.price_parcelado && (
                                <span className="price-tag parcelado">📅 {m.price_parcelado}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === 'rates' && (
                      <div>
                        {uniqueRates.length === 0 ? (
                          <div className="empty"><div className="empty-icon">📊</div>Sem dados</div>
                        ) : uniqueRates.map((r, i) => (
                          <div key={i} className="rate-row">
                            <span className="rate-category">
                              {r.category}
                              <span className="rate-plan-badge">{r.plan.slice(0, 12)}</span>
                            </span>
                            <span className="rate-value">{r.rate}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === 'promos' && (
                      <div>
                        {promotions.length === 0 ? (
                          <div className="empty"><div className="empty-icon">📢</div>Sem promoções</div>
                        ) : promotions.slice(0, 10).map((p, i) => (
                          <div key={i} className="promo-item">
                            <div className="promo-location">{p.location}</div>
                            {p.text.slice(0, 120)}{p.text.length > 120 ? '...' : ''}
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
      </main>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label }: { icon: string; value: number | string; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
