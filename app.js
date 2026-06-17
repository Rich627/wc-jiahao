'use strict';

/* ============================================================
   家豪世界盃預測 2026 — frontend logic
   Pure static. Reads ./data/predictions.json. No backend, no LLM,
   no external data calls.
   ============================================================ */

const SEL_LABEL = { HOME: '主勝', DRAW: '和局', AWAY: '客勝' };
const SEL_CLASS = { HOME: 'pick-home', DRAW: 'pick-draw', AWAY: 'pick-away' };

const state = {
    matches: [],
    models: [],
    competition: '世界盃',
    currentStage: 'all',
};

/* ---------- utilities ---------- */
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isPlaceholder(name) {
    // group placeholders like A1, B3/E3/..., or 第N場...勝者
    return /^[A-L]\d/.test(name) || /勝者|敗者|胜者|败者/.test(name) || name.indexOf('/') >= 0;
}

function teamInitial(name) {
    if (!name) return '?';
    if (isPlaceholder(name)) return name.length <= 3 ? name : name.slice(0, 2);
    return name.slice(0, 1);
}

function parseTW(kickoff) {
    // "2026-06-17 12:00" interpreted as a wall-clock label (Taiwan time)
    if (!kickoff) return null;
    const m = kickoff.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

function dateKey(kickoff) {
    return (kickoff || '').slice(0, 10);
}

function fmtDateHeading(key) {
    const p = parseTW(key + ' 00:00');
    if (!p) return key;
    const wk = ['日', '一', '二', '三', '四', '五', '六'];
    const dt = new Date(p.y, p.mo - 1, p.d);
    return `${p.mo}月${p.d}日 · 週${wk[dt.getDay()]}`;
}

function fmtTime(kickoff) {
    const p = parseTW(kickoff);
    return p ? `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}` : '';
}

function isFinished(match) {
    return match.status === '已完賽' || (typeof match.score === 'string' && /\d+\s*[-:]\s*\d+/.test(match.score));
}

function shortStage(stage) {
    return (stage || '').replace(/^世界盃\s*/, '').trim();
}

/* ---------- data load ---------- */
async function loadData() {
    const res = await fetch('data/predictions.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('predictions.json 載入失敗: ' + res.status);
    const d = await res.json();
    state.matches = Array.isArray(d.matches) ? d.matches : [];
    state.models = Array.isArray(d.models) ? d.models : [];
    state.competition = d.competition_name || '世界盃';
}

/* ---------- stats strip ---------- */
function renderStats() {
    const total = state.matches.length;
    const withPred = state.matches.filter(m => m.my_prediction).length;
    const finished = state.matches.filter(isFinished).length;
    const upcoming = total - finished;
    const el = document.getElementById('stats-strip');
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">總場次</div></div>
        <div class="stat-box"><div class="stat-num">${withPred}</div><div class="stat-label">已出預測</div></div>
        <div class="stat-box"><div class="stat-num">${upcoming}</div><div class="stat-label">未開賽</div></div>
        <div class="stat-box"><div class="stat-num">${state.models.length}</div><div class="stat-label">AI 模型</div></div>
      </div>`;
}

/* ---------- hero (next upcoming match that has a prediction) ---------- */
function renderHero() {
    const el = document.getElementById('hero-section');
    const candidates = state.matches
        .filter(m => m.my_prediction && !isFinished(m))
        .sort((a, b) => (a.kickoff_tw || '').localeCompare(b.kickoff_tw || ''));
    const match = candidates[0];
    if (!match) { el.innerHTML = ''; return; }

    const p = match.my_prediction;
    const pickLabel = SEL_LABEL[p.consensus_selection] || p.consensus_selection || '';
    const pickClass = SEL_CLASS[p.consensus_selection] || 'pick-draw';
    const winPct = p.win_prob != null ? Math.round(p.win_prob * 100) + '%' : '—';
    const avatars = (p.models || []).map(m =>
        `<span class="llm-avatar" title="${esc(m.name)}">${esc((m.name || '').slice(0, 1))}</span>`
    ).join('');

    el.innerHTML = `
      <div class="hero-card p-6 md:p-8 shadow-card cursor-pointer" data-match="${esc(match.match_id)}">
        <div class="relative z-10">
          <div class="flex items-center justify-between mb-5">
            <span class="badge badge-stage">${esc(shortStage(match.stage))}</span>
            <span class="badge badge-upcoming">下一場焦點預測</span>
          </div>
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-5">
            <div class="text-right hero-team-name text-text-main">${esc(match.home)}</div>
            <div class="hero-vs-mark"><span>VS</span></div>
            <div class="text-left hero-team-name text-text-main">${esc(match.away)}</div>
          </div>
          <div class="text-center text-text-muted text-sm font-mono mb-5">
            ${esc(dateKey(match.kickoff_tw))} ${esc(fmtTime(match.kickoff_tw))} (台灣時間)
          </div>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5">
            <span class="pick-chip ${pickClass} text-base px-4 py-2">家豪共識：${esc(pickLabel)}${p.consensus_team ? ' · ' + esc(p.consensus_team) : ''}</span>
            <span class="text-text-muted text-sm font-mono">勝率 ${winPct}</span>
            <span class="text-text-muted text-sm font-mono">預測比分 ${esc(p.predicted_score || '—')}</span>
          </div>
          <div class="flex items-center justify-center gap-1 mt-5">
            ${avatars}
            <span class="ml-2 text-xs text-text-muted">${esc(p.agree || '')} 認同</span>
          </div>
        </div>
      </div>`;
    el.querySelector('[data-match]').addEventListener('click', () => openDetail(match.match_id));
}

/* ---------- stage tabs ---------- */
function uniqueStages() {
    const seen = [];
    state.matches.forEach(m => {
        const s = shortStage(m.stage);
        if (s && seen.indexOf(s) < 0) seen.push(s);
    });
    return seen;
}

function renderTabs() {
    const el = document.getElementById('stage-tabs');
    const stages = ['all', ...uniqueStages()];
    el.innerHTML = stages.map(s => {
        const label = s === 'all' ? '全部' : s;
        const active = state.currentStage === s ? ' active' : '';
        return `<button class="stage-tab${active}" data-stage="${esc(s)}">${esc(label)}</button>`;
    }).join('');
    el.querySelectorAll('[data-stage]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentStage = btn.dataset.stage;
            renderTabs();
            renderMatches();
        });
    });
}

/* ---------- match card ---------- */
function logoCell(name) {
    return `<div class="logo-placeholder w-11 h-11 rounded-full text-sm">${esc(teamInitial(name))}</div>`;
}

function statusBadge(match) {
    if (isFinished(match)) return '<span class="badge badge-finished">已完賽</span>';
    return '<span class="badge badge-upcoming">未開賽</span>';
}

function oddsRow(odds) {
    if (!odds) return '';
    const cell = (k, v) => `<div class="odds-cell"><div class="odds-k">${k}</div><div class="odds-v">${v != null ? v : '—'}</div></div>`;
    return `<div class="grid grid-cols-3 gap-2 mt-4">
        ${cell('主勝', odds.H)}${cell('和局', odds.D)}${cell('客勝', odds.A)}
      </div>`;
}

function predictionStrip(match) {
    const p = match.my_prediction;
    if (!p) {
        return `<div class="mt-4 pt-3 border-t border-gray-100 text-xs text-text-muted text-center">尚未出預測</div>`;
    }
    const pickLabel = SEL_LABEL[p.consensus_selection] || '';
    const pickClass = SEL_CLASS[p.consensus_selection] || 'pick-draw';
    const winPct = p.win_prob != null ? Math.round(p.win_prob * 100) + '%' : '';
    return `<div class="mt-4 pt-3 border-t border-gray-100">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span class="pick-chip ${pickClass}">家豪：${esc(pickLabel)}${p.consensus_team ? ' · ' + esc(p.consensus_team) : ''}</span>
          <span class="text-xs text-text-muted font-mono">${esc(p.predicted_score || '')}${winPct ? ' · ' + winPct : ''}</span>
        </div>
        <div class="mt-2 text-[11px] text-text-muted">${esc(p.agree || '')} 認同 · 點擊看各模型分析</div>
      </div>`;
}

function matchCardHtml(match) {
    const hasP = !!match.my_prediction;
    const finished = isFinished(match);
    const center = finished
        ? `<div class="text-2xl font-bold font-mono text-text-main">${esc(match.score || '')}</div>`
        : `<div class="text-sm font-mono text-text-muted">${esc(fmtTime(match.kickoff_tw))}</div>`;
    return `<div class="match-card rounded-xl p-5 ${hasP ? 'has-predict' : 'no-predict'}" data-match="${esc(match.match_id)}">
        <div class="flex items-center justify-between mb-4">
          <span class="badge badge-stage">${esc(shortStage(match.stage))}</span>
          ${statusBadge(match)}
        </div>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div class="flex flex-col items-center gap-2 text-center">
            ${logoCell(match.home)}
            <span class="team-name text-sm text-text-main">${esc(match.home)}</span>
          </div>
          <div class="px-2 text-center">${center}<div class="text-[10px] text-text-muted mt-1">VS</div></div>
          <div class="flex flex-col items-center gap-2 text-center">
            ${logoCell(match.away)}
            <span class="team-name text-sm text-text-main">${esc(match.away)}</span>
          </div>
        </div>
        ${oddsRow(match.had_odds)}
        ${predictionStrip(match)}
      </div>`;
}

/* ---------- matches list (grouped by date; finished collapsed) ---------- */
function renderMatches() {
    const container = document.getElementById('matches-container');
    let list = state.matches.slice();
    if (state.currentStage !== 'all') {
        list = list.filter(m => shortStage(m.stage) === state.currentStage);
    }
    list.sort((a, b) => (a.kickoff_tw || '').localeCompare(b.kickoff_tw || ''));

    const upcoming = list.filter(m => !isFinished(m));
    const finished = list.filter(isFinished);

    function groupHtml(arr) {
        const byDate = {};
        arr.forEach(m => {
            const k = dateKey(m.kickoff_tw);
            (byDate[k] = byDate[k] || []).push(m);
        });
        return Object.keys(byDate).sort().map(k => {
            const cards = byDate[k].map(matchCardHtml).join('');
            return `<div class="mb-8">
                <div class="match-date-heading">
                  <span class="date-group-line"></span>
                  <h3 class="text-base font-bold text-text-main">${esc(fmtDateHeading(k))}</h3>
                  <span class="text-xs text-text-muted">${byDate[k].length} 場</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">${cards}</div>
              </div>`;
        }).join('');
    }

    let html = '';
    if (upcoming.length) html += groupHtml(upcoming);
    if (finished.length) {
        html += `<details class="match-history-group mt-4" ${upcoming.length ? '' : 'open'}>
            <summary class="match-history-summary">
              <span class="date-group-line"></span>
              <svg class="match-date-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              <h3 class="text-base font-bold text-text-main">已完賽</h3>
              <span class="text-xs text-text-muted">${finished.length} 場</span>
            </summary>
            <div class="match-history-content">${groupHtml(finished)}</div>
          </details>`;
    }
    if (!html) html = `<div class="text-center text-text-muted py-16">此階段尚無比賽</div>`;
    container.innerHTML = html;

    container.querySelectorAll('.match-card.has-predict[data-match]').forEach(card => {
        card.addEventListener('click', () => openDetail(card.dataset.match));
    });
}

/* ---------- detail modal ---------- */
function modelBlockHtml(m) {
    const pickLabel = SEL_LABEL[m.selection] || m.selection || '';
    const pickClass = SEL_CLASS[m.selection] || 'pick-draw';
    const wp = m.win_prob;
    const wpStr = wp && typeof wp === 'object'
        ? `主 ${Math.round((wp.H || 0) * 100)}% · 和 ${Math.round((wp.D || 0) * 100)}% · 客 ${Math.round((wp.A || 0) * 100)}%`
        : '';
    const conf = m.confidence != null ? Math.round(m.confidence * 100) + '%' : '';
    return `<div class="model-block">
        <div class="model-head">
          <span class="model-name">${esc(m.name)}</span>
          <span class="pick-chip ${pickClass}">${esc(pickLabel)}${m.selection_team ? ' · ' + esc(m.selection_team) : ''}</span>
        </div>
        <div class="kv-row">
          ${m.predicted_score ? `<span>預測比分 <b>${esc(m.predicted_score)}</b></span>` : ''}
          ${conf ? `<span>信心 <b>${conf}</b></span>` : ''}
          ${wpStr ? `<span>${esc(wpStr)}</span>` : ''}
        </div>
        ${m.reasoning_md ? `<div class="model-reason">${esc(m.reasoning_md)}</div>` : ''}
        ${m.key_risk ? `<div class="model-risk">⚠ 風險：${esc(m.key_risk)}</div>` : ''}
      </div>`;
}

function openDetail(matchId) {
    const match = state.matches.find(m => String(m.match_id) === String(matchId));
    if (!match || !match.my_prediction) return;
    const p = match.my_prediction;
    document.getElementById('detail-modal-title').textContent = `${match.home} vs ${match.away}`;
    const pickLabel = SEL_LABEL[p.consensus_selection] || '';
    const pickClass = SEL_CLASS[p.consensus_selection] || 'pick-draw';
    const winPct = p.win_prob != null ? Math.round(p.win_prob * 100) + '%' : '—';
    const odds = match.had_odds || {};

    document.getElementById('detail-body').innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <span class="badge badge-stage">${esc(shortStage(match.stage))}</span>
        <span class="text-xs text-text-muted font-mono">${esc(dateKey(match.kickoff_tw))} ${esc(fmtTime(match.kickoff_tw))} (台灣時間)</span>
      </div>
      <div class="rounded-xl p-4 mb-3" style="background:var(--color-info-soft);border:1px solid var(--color-info-border)">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span class="pick-chip ${pickClass} text-sm">家豪共識：${esc(pickLabel)}${p.consensus_team ? ' · ' + esc(p.consensus_team) : ''}</span>
          <span class="text-sm font-mono text-text-muted">勝率 ${winPct} · 比分 ${esc(p.predicted_score || '—')} · ${esc(p.agree || '')} 認同</span>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 mb-4">
        <div class="odds-cell"><div class="odds-k">主勝賠率</div><div class="odds-v">${odds.H != null ? odds.H : '—'}</div></div>
        <div class="odds-cell"><div class="odds-k">和局賠率</div><div class="odds-v">${odds.D != null ? odds.D : '—'}</div></div>
        <div class="odds-cell"><div class="odds-k">客勝賠率</div><div class="odds-v">${odds.A != null ? odds.A : '—'}</div></div>
      </div>
      <h3 class="text-sm font-bold text-text-main mb-1">各模型分析</h3>
      ${(p.models || []).map(modelBlockHtml).join('')}
      <p class="mt-4 text-[11px] text-center text-secondary font-semibold">純娛樂，別跟著下注</p>`;
    showModal('detail-modal');
}

/* ---------- modals plumbing ---------- */
function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.classList.add('modal-open');
}
function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (!document.querySelector('.risk-modal:not(.hidden), .info-modal:not(.hidden)')) {
        document.body.classList.remove('modal-open');
    }
}

function wireModals() {
    document.querySelectorAll('[data-info-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.info-modal');
            if (modal) hideModal(modal.id);
        });
    });
    document.querySelector('[data-rules-open]').addEventListener('click', () => showModal('rules-modal'));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.info-modal:not(.hidden)').forEach(m => hideModal(m.id));
        }
    });

    // Theme toggle
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-theme-toggle]');
        if (!t) return;
        const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('worldcup-theme', next); } catch (_) {}
        document.documentElement.dataset.theme = next;
    });

    // Risk gate (once per browser)
    const accepted = (() => { try { return localStorage.getItem('worldcup-risk-ok') === '1'; } catch (_) { return false; } })();
    if (!accepted) {
        showModal('risk-modal');
        document.getElementById('risk-accept').addEventListener('click', () => {
            try { localStorage.setItem('worldcup-risk-ok', '1'); } catch (_) {}
            document.getElementById('risk-modal').classList.add('hidden');
            document.body.classList.remove('modal-open');
        });
        document.getElementById('risk-leave').addEventListener('click', () => { window.location.href = 'about:blank'; });
    }
}

/* ---------- boot ---------- */
async function init() {
    wireModals();
    try {
        await loadData();
        renderHero();
        renderStats();
        renderTabs();
        renderMatches();
    } catch (err) {
        document.getElementById('matches-container').innerHTML =
            `<div class="text-center text-secondary py-16">資料載入失敗：${esc(err.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
