'use strict';

const SEL_CLASS = { HOME: 'home', DRAW: 'draw', AWAY: 'away' };
const SEL_LABEL = { HOME: '主勝', DRAW: '和局', AWAY: '客勝' };

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal markdown -> HTML. Supports: **bold**, `code`, - / * bullets,
// 1. ordered lists, and paragraphs separated by blank lines.
function renderMarkdown(md) {
  if (!md) return '';
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let listType = null;
  let para = [];

  function inline(text) {
    let t = escapeHtml(text);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return t;
  }
  function flushPara() {
    if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; }
  }
  function closeList() {
    if (listType) { html += '</' + listType + '>'; listType = null; }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') { flushPara(); closeList(); continue; }
    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
      html += '<li>' + inline(ol[2]) + '</li>';
    } else if (ul) {
      flushPara();
      if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
      html += '<li>' + inline(ul[1]) + '</li>';
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return html;
}

function pct(n) { return Math.round((Number(n) || 0) * 100); }
function fmtOdds(v) { return v == null ? '—' : Number(v).toFixed(2); }

// ---- Model badge metadata (provider -> short label + brand class) ----
// Pure inline/CSS, no external image/CDN. Each provider gets a colored circular badge.
const MODEL_META = {
  'GPT家豪':      { short: 'G',  prov: 'gpt' },
  'Claude家豪':   { short: 'C',  prov: 'claude' },
  'DeepSeek家豪': { short: 'D',  prov: 'deepseek' },
  'Gemini家豪':   { short: 'Ge', prov: 'gemini' },
  'Kimi家豪':     { short: 'K',  prov: 'kimi' },
};
function modelMeta(name) {
  return MODEL_META[name] || { short: (name || '?').slice(0, 1), prov: 'other' };
}
function modelBadgeHtml(m, opts) {
  opts = opts || {};
  const meta = modelMeta(m.name);
  const cls = SEL_CLASS[m.selection] || 'draw';
  const title = `${escapeHtml(m.name)} → ${SEL_LABEL[m.selection] || ''} ${escapeHtml(m.selection_team || '')}`;
  return `<span class="mbadge prov-${meta.prov} pick-${cls}" title="${title}">` +
    `<span class="mbadge-dot">${escapeHtml(meta.short)}</span>` +
    (opts.showName ? `<span class="mbadge-name">${escapeHtml(m.name)}</span>` : '') +
    `</span>`;
}

// ---- Big pick banner (the obvious 主勝/和局/客勝) ----
function bigPickHtml(match) {
  const mp = match.my_prediction;
  if (!mp) return '';
  const cls = SEL_CLASS[mp.consensus_selection] || 'draw';
  const label = SEL_LABEL[mp.consensus_selection] || '—';
  const winPct = mp.win_prob != null ? pct(mp.win_prob) + '%' : '—';
  const pscore = mp.predicted_score ? escapeHtml(mp.predicted_score) : '—';
  return `
    <div class="bigpick ${cls}">
      <div class="bigpick-main">
        <span class="bigpick-tag">家豪共識</span>
        <span class="bigpick-label">${label}</span>
        <span class="bigpick-team">${escapeHtml(mp.consensus_team || '')}</span>
      </div>
      <div class="bigpick-meta">
        <span>勝率 <b>${winPct}</b></span>
        <span>預測比分 <b>${pscore}</b></span>
        ${mp.agree ? `<span>一致 <b>${escapeHtml(mp.agree)}</b></span>` : ''}
      </div>
    </div>`;
}

// ---- HAD odds row ----
function oddsHtml(o) {
  if (!o) return '<div class="odds odds-none">台彩 HAD 賠率：暫無</div>';
  return `
    <div class="odds">
      <span class="odds-label">台彩 HAD</span>
      <span class="odds-cell h"><i>主</i><b>${fmtOdds(o.H)}</b></span>
      <span class="odds-cell d"><i>和</i><b>${fmtOdds(o.D)}</b></span>
      <span class="odds-cell a"><i>客</i><b>${fmtOdds(o.A)}</b></span>
    </div>`;
}

function buildProbBar(p) {
  if (!p) return '';
  const h = pct(p.H), d = pct(p.D), a = pct(p.A);
  const seg = (cls, v) =>
    `<div class="prob-seg ${cls}" style="flex:${v || 0.0001}">${v >= 12 ? v + '%' : ''}</div>`;
  return `
    <div class="prob-legend"><span>主勝 ${h}%</span><span>和局 ${d}%</span><span>客勝 ${a}%</span></div>
    <div class="prob-bar">${seg('h', h)}${seg('d', d)}${seg('a', a)}</div>`;
}

// "誰站哪邊一眼看到" — group model badges under 主 / 和 / 客 columns.
function sidesGridHtml(models) {
  const cols = [
    { key: 'HOME', cls: 'home', label: '主勝' },
    { key: 'DRAW', cls: 'draw', label: '和局' },
    { key: 'AWAY', cls: 'away', label: '客勝' },
  ];
  const colHtml = cols.map((c) => {
    const picks = models.filter((m) => m.selection === c.key);
    const badges = picks.map((m) => modelBadgeHtml(m, { showName: true })).join('');
    return `
      <div class="side-col ${c.cls}">
        <div class="side-head">${c.label} <span class="side-count">${picks.length}</span></div>
        <div class="side-badges">${badges || '<span class="side-empty">—</span>'}</div>
      </div>`;
  }).join('');
  return `
    <div class="sides-title">🧭 誰站哪邊（5 模型選邊）</div>
    <div class="sides-grid">${colHtml}</div>`;
}

// One-line per-match consensus summary.
function consensusLineHtml(mp) {
  if (!mp) return '';
  const label = SEL_LABEL[mp.consensus_selection] || '—';
  const winPct = mp.win_prob != null ? pct(mp.win_prob) + '% 勝率' : '';
  const models = mp.models || [];
  const counts = { HOME: 0, DRAW: 0, AWAY: 0 };
  models.forEach((m) => { if (counts[m.selection] != null) counts[m.selection]++; });
  const split = `主${counts.HOME}/和${counts.DRAW}/客${counts.AWAY}`;
  const team = mp.consensus_team ? escapeHtml(mp.consensus_team) : '';
  const cls = SEL_CLASS[mp.consensus_selection] || 'draw';
  return `<div class="consensus-line ${cls}">📌 家豪共識：<b>${label} ${team}</b> · ${split}` +
    (winPct ? ` · ${winPct}` : '') +
    (mp.predicted_score ? ` · 比分 ${escapeHtml(mp.predicted_score)}` : '') + `</div>`;
}

// Single model's full output — the body shown inside the active tab.
function modelPanelHtml(m, idx, active) {
  const conf = m.confidence != null ? pct(m.confidence) + '%' : '—';
  const cls = SEL_CLASS[m.selection] || 'draw';
  return `
    <div class="model-panel${active ? ' active' : ''}" data-model-idx="${idx}">
      <div class="model-head">
        <span class="model-name">${modelBadgeHtml(m, { showName: true })}</span>
        <span class="model-pick ${cls}">${SEL_LABEL[m.selection] || ''} · ${escapeHtml(m.selection_team || '')}</span>
      </div>
      <div class="model-stats">
        <div><span class="label">預測比分</span><span class="val">${escapeHtml(m.predicted_score || '—')}</span></div>
        <div><span class="label">信心度</span><span class="val">${conf}</span></div>
      </div>
      ${buildProbBar(m.win_prob)}
      ${m.key_risk ? `<div class="risk"><span class="label">關鍵風險：</span>${escapeHtml(m.key_risk)}</div>` : ''}
      ${m.reasoning_md ? `<div class="reasoning">${renderMarkdown(m.reasoning_md)}</div>` : ''}
    </div>`;
}

// Tabbed per-model viewer (point 2). Includes an "expand all" toggle (point 3)
// that swaps from single-tab view to all-models-stacked view.
function modelsTabsHtml(models) {
  const tabs = models.map((m, i) => {
    const meta = modelMeta(m.name);
    const cls = SEL_CLASS[m.selection] || 'draw';
    return `<button type="button" class="model-tab prov-${meta.prov} pick-${cls}${i === 0 ? ' active' : ''}" data-tab-idx="${i}">` +
      `<span class="mbadge-dot">${escapeHtml(meta.short)}</span>` +
      `<span class="model-tab-name">${escapeHtml(m.name)}</span></button>`;
  }).join('');
  const panels = models.map((m, i) => modelPanelHtml(m, i, i === 0)).join('');
  return `
    <div class="models-block">
      <div class="models-toolbar">
        <div class="model-tabs" role="tablist">${tabs}</div>
        <button type="button" class="expand-all" aria-pressed="false">
          <span class="ea-collapsed">⊞ 展開看全部</span>
          <span class="ea-expanded">⊟ 收回分頁</span>
        </button>
      </div>
      <div class="model-panels">${panels}</div>
    </div>`;
}

function statusBadgeHtml(match) {
  if (match.status === '已完賽') {
    let extra = '';
    if (match.correct === true) extra = '<span class="hit ok">✓ 命中</span>';
    else if (match.correct === false) extra = '<span class="hit miss">✗ 未中</span>';
    return `<span class="status done">已完賽</span>${extra}`;
  }
  return '<span class="status upcoming">未開賽</span>';
}

function scoreRowHtml(match) {
  if (match.status !== '已完賽' || !match.score) return '';
  return `<div class="final-score">最終比分 <b>${escapeHtml(match.score)}</b></div>`;
}

function matchCardHtml(match) {
  const mp = match.my_prediction;
  const models = mp ? (mp.models || []) : [];
  const hasDetail = mp && models.some((m) => m.reasoning_md || m.win_prob);
  const done = match.status === '已完賽';

  return `
    <article class="match-card${done ? ' is-done' : ''}${mp ? ' has-pick' : ''}" id="match-${escapeHtml(match.match_id)}">
      <div class="match-head">
        <div class="match-top">
          <span class="match-time">🕒 ${escapeHtml(match.kickoff_tw || '')}（台灣時間）</span>
          <span class="match-status">${statusBadgeHtml(match)}</span>
        </div>
        ${match.stage ? `<div class="match-stage">${escapeHtml(match.stage)}</div>` : ''}
        <div class="teams">
          <div class="team home"><div class="team-name">${escapeHtml(match.home)}</div></div>
          <div class="vs">VS</div>
          <div class="team away"><div class="team-name">${escapeHtml(match.away)}</div></div>
        </div>
        ${scoreRowHtml(match)}
        ${bigPickHtml(match)}
        ${mp ? consensusLineHtml(mp) : ''}
        ${models.length ? sidesGridHtml(models) : ''}
        ${oddsHtml(match.had_odds)}
        ${hasDetail ? `
        <button class="toggle-detail" type="button" aria-expanded="false">
          <span class="open-txt">▾ 點開看 5 個模型完整分析</span>
          <span class="closed-txt">▴ 收起</span>
        </button>` : (mp ? '<div class="no-detail">（此場僅有模型選邊與比分，無完整分析）</div>' : '')}
      </div>
      ${hasDetail ? `<div class="match-detail">${modelsTabsHtml(models)}</div>` : ''}
    </article>`;
}

function dateLabel(kickoff) {
  // kickoff "2026-06-18 01:00" -> "6/18（週X）"
  const d = (kickoff || '').slice(0, 10);
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const wd = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()] || '';
  return `${Number(parts[1])}/${Number(parts[2])}（週${wd}）`;
}

// Top-of-page overview (point 4): all 家豪-predicted matches + their picks at a glance.
function buildOverview(matches) {
  const el = document.getElementById('overview');
  if (!el) return;
  const picked = matches.filter((m) => m.my_prediction);
  if (!picked.length) { el.innerHTML = ''; return; }

  const rows = picked.map((m) => {
    const mp = m.my_prediction;
    const cls = SEL_CLASS[mp.consensus_selection] || 'draw';
    const label = SEL_LABEL[mp.consensus_selection] || '—';
    const models = mp.models || [];
    const counts = { HOME: 0, DRAW: 0, AWAY: 0 };
    models.forEach((mm) => { if (counts[mm.selection] != null) counts[mm.selection]++; });
    const unanimous = label && models.length && counts[mp.consensus_selection] === models.length;
    const winPct = mp.win_prob != null ? pct(mp.win_prob) + '%' : '—';
    const done = m.status === '已完賽';
    let hit = '';
    if (done && m.correct === true) hit = '<span class="hit ok">✓</span>';
    else if (done && m.correct === false) hit = '<span class="hit miss">✗</span>';
    return `
      <a class="ov-row ${cls}" href="#match-${escapeHtml(m.match_id)}">
        <div class="ov-teams">${escapeHtml(m.home)} <i>vs</i> ${escapeHtml(m.away)}</div>
        <div class="ov-pick">
          <span class="ov-tag ${cls}">${label}</span>
          <span class="ov-team">${escapeHtml(mp.consensus_team || '')}</span>
          ${unanimous ? '<span class="ov-unanimous">5/5 一致</span>' : `<span class="ov-split">主${counts.HOME}/和${counts.DRAW}/客${counts.AWAY}</span>`}
          <span class="ov-prob">${winPct}</span>
          ${hit}
        </div>
      </a>`;
  }).join('');

  el.innerHTML = `
    <details class="overview" open>
      <summary>📊 家豪預測總覽（${picked.length} 場）</summary>
      <div class="ov-body">${rows}</div>
    </details>`;
}

function wireMatchInteractions(list) {
  // expand/collapse detail
  list.querySelectorAll('.toggle-detail').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.match-card');
      const open = card.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  // per-model tab switching (point 2)
  list.querySelectorAll('.models-block').forEach((block) => {
    const tabs = block.querySelectorAll('.model-tab');
    const panels = block.querySelectorAll('.model-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const idx = tab.getAttribute('data-tab-idx');
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        panels.forEach((p) => p.classList.toggle('active', p.getAttribute('data-model-idx') === idx));
      });
    });
    // expand-all toggle (point 3): show every model panel stacked
    const ea = block.querySelector('.expand-all');
    if (ea) {
      ea.addEventListener('click', () => {
        const on = block.classList.toggle('show-all');
        ea.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
  });
}

function render(data) {
  const list = document.getElementById('match-list');
  const gen = document.getElementById('generated-at');

  if (data.generated_at) {
    gen.textContent = '更新時間：' + data.generated_at.replace('T', ' ').replace(/(\+\d{2}:\d{2})$/, '');
  }

  const matches = (data.matches || []).slice().sort((a, b) =>
    (a.kickoff_tw || '') < (b.kickoff_tw || '') ? -1 : (a.kickoff_tw || '') > (b.kickoff_tw || '') ? 1 : 0);

  if (!matches.length) {
    list.innerHTML = '<p class="loading">目前沒有比賽資料。</p>';
    return;
  }

  const upcoming = matches.filter((m) => m.status !== '已完賽');
  const played = matches.filter((m) => m.status === '已完賽');

  // summary counts
  const summary = document.getElementById('summary');
  if (summary) {
    const withPick = matches.filter((m) => m.my_prediction).length;
    summary.innerHTML =
      `<span>全部 <b>${matches.length}</b> 場</span>` +
      `<span>未開賽 <b>${upcoming.length}</b></span>` +
      `<span>已完賽 <b>${played.length}</b></span>` +
      `<span>家豪預測 <b>${withPick}</b></span>`;
  }

  function groupByDate(arr) {
    let html = '';
    let lastDate = null;
    for (const m of arr) {
      const dl = dateLabel(m.kickoff_tw);
      if (dl !== lastDate) {
        html += `<h3 class="date-head">${escapeHtml(dl)}</h3>`;
        lastDate = dl;
      }
      html += matchCardHtml(m);
    }
    return html;
  }

  let html = '';
  if (upcoming.length) {
    html += `<section class="sched-section"><h2 class="section-title up">⚽ 未開賽 <span>${upcoming.length}</span></h2>${groupByDate(upcoming)}</section>`;
  }
  if (played.length) {
    // played newest-first
    const playedDesc = played.slice().reverse();
    html += `<section class="sched-section"><h2 class="section-title done">✅ 已完賽 <span>${played.length}</span></h2>${groupByDate(playedDesc)}</section>`;
  }
  list.innerHTML = html;

  buildOverview(matches);
  wireMatchInteractions(list);
}

function showError(msg) {
  const list = document.getElementById('match-list');
  list.innerHTML =
    '<div class="error-box">載入資料失敗：' + escapeHtml(msg) +
    '<br><br>若以 file:// 開啟，部分瀏覽器會封鎖 fetch，請改用 <code>python3 -m http.server</code> 開啟本站。</div>';
}

fetch('data/predictions.json', { cache: 'no-store' })
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(render)
  .catch((err) => showError(err.message || String(err)));
