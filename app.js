'use strict';

/* ============================================================
   足球 Master 世界盃預測 2026 — frontend logic
   Pure static. Reads ./data/predictions.json. No backend, no LLM,
   no external data calls.
   ============================================================ */

const SEL_LABEL = { HOME: '主勝', DRAW: '和局', AWAY: '客勝' };
const SEL_CLASS = { HOME: 'pick-home', DRAW: 'pick-draw', AWAY: 'pick-away' };

/* ---------- team flag map (中文隊名 → ISO2 for flagcdn.com) ---------- */
const TEAM_ISO2 = {
    '伊拉克': 'iq', '伊朗': 'ir', '克羅埃西亞': 'hr', '剛果民主共和國': 'cd', '剛果民主': 'cd',
    '加拿大': 'ca', '南非': 'za', '卡達': 'qa', '厄瓜多': 'ec', '哥倫比亞': 'co',
    '土耳其': 'tr', '埃及': 'eg', '塞內加爾': 'sn', '墨西哥': 'mx', '奧地利': 'at',
    '巴拉圭': 'py', '巴拿馬': 'pa', '巴西': 'br', '庫拉索': 'cw', '德國': 'de',
    '挪威': 'no', '捷克': 'cz', '摩洛哥': 'ma', '日本': 'jp', '比利時': 'be',
    '沙烏地阿拉伯': 'sa', '法國': 'fr', '波黑': 'ba', '海地': 'ht', '澳大利亞': 'au',
    '澳洲': 'au', '烏拉圭': 'uy', '烏茲別克': 'uz', '瑞典': 'se', '瑞士': 'ch',
    '突尼西亞': 'tn', '突尼斯': 'tn', '約旦': 'jo', '紐西蘭': 'nz', '維德角': 'cv',
    '佛得角': 'cv', '美國': 'us', '英格蘭': 'gb-eng', '荷蘭': 'nl', '葡萄牙': 'pt',
    '蘇格蘭': 'gb-sct', '西班牙': 'es', '象牙海岸': 'ci', '科特迪瓦': 'ci', '迦納': 'gh',
    '加納': 'gh', '阿根廷': 'ar', '阿爾及利亞': 'dz', '韓國': 'kr', '南韓': 'kr',
    '威爾斯': 'gb-wls'
};

function teamFlagIso(name) {
    if (!name || isPlaceholder(name)) return null;
    return TEAM_ISO2[name] || null;
}

/* ---------- model brand marks (self-contained inline SVG, no external CDN) ---------- */
const MODEL_BRANDS = {
    GPT:      { key: 'gpt',      label: 'GPT',      short: 'GPT' },
    Claude:   { key: 'claude',   label: 'Claude',   short: 'CL'  },
    DeepSeek: { key: 'deepseek', label: 'DeepSeek', short: 'DS'  },
    Gemini:   { key: 'gemini',   label: 'Gemini',   short: 'GM'  },
    Kimi:     { key: 'kimi',     label: 'Kimi',     short: 'KM'  },
    Grok:     { key: 'grok',     label: 'Grok',     short: 'GK'  },
    GLM:      { key: 'glm',      label: 'GLM',      short: 'GLM' }
};

function modelMeta(name) {
    const n = String(name || '').trim();
    if (MODEL_BRANDS[n]) return MODEL_BRANDS[n];
    // fuzzy match (e.g. "GPT-4o", "Claude 3.5", "Gemini Pro")
    const lower = n.toLowerCase();
    for (const k in MODEL_BRANDS) {
        if (lower.indexOf(k.toLowerCase()) >= 0) return MODEL_BRANDS[k];
    }
    if (lower.indexOf('openai') >= 0) return MODEL_BRANDS.GPT;
    if (lower.indexOf('anthropic') >= 0) return MODEL_BRANDS.Claude;
    if (lower.indexOf('google') >= 0) return MODEL_BRANDS.Gemini;
    if (lower.indexOf('moonshot') >= 0) return MODEL_BRANDS.Kimi;
    if (lower.indexOf('grok') >= 0 || lower.indexOf('xai') >= 0 || lower.indexOf('x-ai') >= 0) return MODEL_BRANDS.Grok;
    if (lower.indexOf('glm') >= 0 || lower.indexOf('zhipu') >= 0 || lower.indexOf('z-ai') >= 0 || lower.indexOf('z.ai') >= 0) return MODEL_BRANDS.GLM;
    return null;
}

// Inline SVG brand-ish marks (openly drawn, not copyrighted logos), brand-colored.
const MODEL_SVG = {
    gpt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6a4.6 4.6 0 014.2 2.74 4.6 4.6 0 012.66 7.9 4.6 4.6 0 01-4.05 5.46A4.6 4.6 0 017.8 21.4a4.6 4.6 0 01-2.66-7.9A4.6 4.6 0 019.19 4.04 4.6 4.6 0 0112 2.6zm0 3.4a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z"/></svg>',
    claude: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 17.8L9.9 6.2h2.5l4.3 11.6h-2.4l-.9-2.6H8.9l-.9 2.6H5.6zm4-4.5h3.1l-1.55-4.5-1.55 4.5zM17 6.2h2.2v11.6H17z"/></svg>',
    deepseek: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8c4.5 1 6.5 3.4 7.4 5.2.6-1.7 2-3.2 4.6-3.8-1 .9-1.6 1.9-1.8 3.2 1.5.3 3 .3 4.8-.4-2 2.6-4.7 3.6-7 3.4-3.2-.3-6.2-2.6-8-7.6z"/><circle cx="13.3" cy="12.2" r="1"/></svg>',
    gemini: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.4 4.8 2.6 8.6 8 10-5.4 1.4-7.6 5.2-8 10-.4-4.8-2.6-8.6-8-10 5.4-1.4 7.6-5.2 8-10z"/></svg>',
    kimi: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.4" fill="#fff"/></svg>',
    grok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 15.3l8-5.9c.4-.3.95-.18 1.14.27 1 2.37.54 5.22-1.41 7.17-1.95 1.95-4.67 2.38-7.15 1.4l-2.7 1.26c3.9 2.66 8.6 2 11.56-.95 2.34-2.35 3.07-5.54 2.39-8.42-.98-4.23.24-5.92 2.75-9.38l.18-.25-3.3 3.3L9.3 15.3zm-1.65 1.43c-2.8-2.67-2.31-6.83.07-9.21 1.76-1.77 4.65-2.49 7.17-1.42l2.7-1.25a6.5 6.5 0 0 0-1.73-.89C12.84 2.79 9.34 3.43 6.88 5.89 4.52 8.26 3.8 11.82 5.08 14.94l2.57 1.8z"/></svg>',
    glm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 6.5h10.6v2L9.6 16.5h7.7v2H6.5v-2l7.7-8H6.7z"/></svg>'
};

// Replace a failed logo <img> with the inline colored-circle fallback mark.
function modelLogoFail(img) {
    const key = img.getAttribute('data-key') || '';
    const name = img.getAttribute('data-name') || '';
    const short = img.getAttribute('data-short') || '';
    const wrap = img.parentNode;
    if (!wrap) return;
    const mark = document.createElement('span');
    mark.className = 'model-mark model-' + key;
    mark.title = name;
    mark.innerHTML = MODEL_SVG[key] || short;
    wrap.replaceWith(mark);
}

function modelBadge(name, cls) {
    const meta = modelMeta(name);
    const extra = cls ? ' ' + cls : '';
    if (!meta) {
        return `<span class="model-mark model-mark-fallback${extra}" title="${esc(name)}">${esc(String(name || '').slice(0, 1))}</span>`;
    }
    // Real official brand logos (local files). On load failure, gracefully
    // fall back to the inline colored-circle mark so we never show a broken image.
    return `<span class="model-logo-wrap${extra}" title="${esc(name)}">` +
        `<img src="assets/models/${meta.key}.svg" class="model-logo" ` +
        `alt="${esc(meta.label)} logo" data-key="${esc(meta.key)}" ` +
        `data-name="${esc(name)}" data-short="${esc(meta.short)}" ` +
        `onerror="modelLogoFail(this)"></span>`;
}

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
    const avatars = (p.models || []).map(m => modelBadge(m.name, 'llm-avatar')).join('');

    el.innerHTML = `
      <div class="hero-card p-6 md:p-8 shadow-card cursor-pointer" data-match="${esc(match.match_id)}">
        <div class="relative z-10">
          <div class="flex items-center justify-between mb-5">
            <span class="badge badge-stage">${esc(shortStage(match.stage))}</span>
            <span class="badge badge-upcoming">下一場焦點預測</span>
          </div>
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-5">
            <div class="hero-team hero-team-home">
              ${flagImg(match.home, 'hero-flag', 'w160')}
              <span class="hero-team-name text-text-main">${esc(match.home)}</span>
            </div>
            <div class="hero-vs-mark"><span>VS</span></div>
            <div class="hero-team hero-team-away">
              ${flagImg(match.away, 'hero-flag', 'w160')}
              <span class="hero-team-name text-text-main">${esc(match.away)}</span>
            </div>
          </div>
          <div class="text-center text-text-muted text-sm font-mono mb-5">
            ${esc(dateKey(match.kickoff_tw))} ${esc(fmtTime(match.kickoff_tw))} (台灣時間)
          </div>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5">
            <span class="pick-chip ${pickClass} text-base px-4 py-2">Master 共識：${esc(pickLabel)}${p.consensus_team ? ' · ' + esc(p.consensus_team) : ''}</span>
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
function flagImg(name, sizeClass, cdnW) {
    // Renders a flag <img>; on error swaps in the letter-circle fallback.
    const iso = teamFlagIso(name);
    const fallback = `<div class="logo-placeholder ${sizeClass} rounded-full text-sm">${esc(teamInitial(name))}</div>`;
    if (!iso) return fallback;
    const w = cdnW || 'w80';
    const src = `https://flagcdn.com/${w}/${iso}.png`;
    const fb = fallback.replace(/"/g, '&quot;');
    return `<img src="${src}" alt="${esc(name)}" class="team-flag ${sizeClass} rounded-full" loading="lazy"
        onerror="this.onerror=null;this.outerHTML='${fb}';">`;
}

function logoCell(name) {
    return flagImg(name, 'w-11 h-11', 'w80');
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
    const finished = isFinished(match);
    if (!p) {
        // Finished but no model prediction → show the final score, not "尚未出預測".
        const txt = finished
            ? `已完賽 ${esc(match.score || '')}`
            : '尚未出預測';
        return `<div class="mt-4 pt-3 border-t border-gray-100 text-xs text-text-muted text-center">${txt}</div>`;
    }
    const pickLabel = SEL_LABEL[p.consensus_selection] || '';
    const pickClass = SEL_CLASS[p.consensus_selection] || 'pick-draw';
    const winPct = p.win_prob != null ? Math.round(p.win_prob * 100) + '%' : '';
    // Finished match WITH a prediction: show predicted vs actual + correct mark.
    let resultLine = '';
    if (finished) {
        const correct = match.correct;
        const mark = correct === true ? '<span class="font-bold" style="color:#10B981">✓ 命中</span>'
            : correct === false ? '<span class="text-secondary font-bold">✗ 未中</span>'
            : '';
        resultLine = `<div class="mt-2 text-[11px] text-text-muted font-mono">
            預測 ${esc(p.predicted_score || '—')} · 實際 <b>${esc(match.score || '—')}</b>${mark ? ' · ' + mark : ''}
          </div>`;
    }
    return `<div class="mt-4 pt-3 border-t border-gray-100">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span class="pick-chip ${pickClass}">Master：${esc(pickLabel)}${p.consensus_team ? ' · ' + esc(p.consensus_team) : ''}</span>
          <span class="text-xs text-text-muted font-mono">${esc(p.predicted_score || '')}${winPct ? ' · ' + winPct : ''}</span>
        </div>
        ${resultLine || `<div class="mt-2 text-[11px] text-text-muted">${esc(p.agree || '')} 認同 · 點擊看各模型分析</div>`}
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

    function groupHtml(arr, descending) {
        const byDate = {};
        arr.forEach(m => {
            const k = dateKey(m.kickoff_tw);
            (byDate[k] = byDate[k] || []).push(m);
        });
        let dateKeys = Object.keys(byDate).sort();
        if (descending) dateKeys = dateKeys.reverse();
        return dateKeys.map(k => {
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
            <div class="match-history-content">${groupHtml(finished, true)}</div>
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
          <span class="model-name-wrap">${modelBadge(m.name)}<span class="model-name">${esc(m.name)}</span></span>
          <span class="pick-chip ${pickClass}">${esc(pickLabel)}${m.selection_team ? ' · ' + esc(m.selection_team) : ''}</span>
        </div>
        <div class="kv-row">
          ${m.predicted_score ? `<span>預測比分 <b>${esc(m.predicted_score)}</b></span>` : ''}
          ${conf ? `<span>信心 <b>${conf}</b></span>` : ''}
          ${wpStr ? `<span>${esc(wpStr)}</span>` : ''}
        </div>
        ${m.reasoning_md ? `<div class="model-reason">${esc(m.reasoning_md)}</div>` : ''}
        ${m.key_risk ? `<div class="model-risk">⚠ 風險：${esc(m.key_risk)}</div>` : ''}
        ${m.script_md ? `<details class="model-script">
          <summary class="model-script-toggle">展開完整劇本 ▾</summary>
          <div class="model-script-body">${mdToHtml(m.script_md)}</div>
        </details>` : ''}
      </div>`;
}

/* Minimal markdown -> HTML for the 劇本 block. Handles bullets, numbered
   list lines, **bold**, and paragraph breaks. Everything is escaped first so
   model output can never inject markup. */
function mdToHtml(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let inList = false, listTag = '';
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const closeList = () => { if (inList) { out.push(`</${listTag}>`); inList = false; } };
    for (let raw of lines) {
        const line = raw.trim();
        if (!line) { closeList(); continue; }
        const ul = line.match(/^[-*•]\s+(.*)$/);
        const ol = line.match(/^\d+[.)、]\s+(.*)$/);
        if (ul) {
            if (!inList || listTag !== 'ul') { closeList(); out.push('<ul>'); inList = true; listTag = 'ul'; }
            out.push(`<li>${inline(ul[1])}</li>`);
        } else if (ol) {
            if (!inList || listTag !== 'ol') { closeList(); out.push('<ol>'); inList = true; listTag = 'ol'; }
            out.push(`<li>${inline(ol[1])}</li>`);
        } else {
            closeList();
            out.push(`<p>${inline(line)}</p>`);
        }
    }
    closeList();
    return out.join('');
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
          <span class="pick-chip ${pickClass} text-sm">Master 共識：${esc(pickLabel)}${p.consensus_team ? ' · ' + esc(p.consensus_team) : ''}</span>
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
