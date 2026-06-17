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

function modelCardHtml(m) {
  const cls = SEL_CLASS[m.selection] || 'draw';
  const conf = m.confidence != null ? pct(m.confidence) + '%' : '—';
  return `
    <div class="model-card">
      <div class="model-head">
        <span class="model-name">${escapeHtml(m.name)}</span>
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
  const hasDetail = mp && (mp.models || []).some((m) => m.reasoning_md || m.win_prob);
  const detail = mp ? (mp.models || []).map(modelCardHtml).join('') : '';
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
        ${oddsHtml(match.had_odds)}
        ${hasDetail ? `
        <button class="toggle-detail" type="button" aria-expanded="false">
          <span class="open-txt">▾ 點開看 5 個模型完整分析</span>
          <span class="closed-txt">▴ 收起</span>
        </button>` : (mp ? '<div class="no-detail">（此場僅有模型選邊與比分，無完整分析）</div>' : '')}
      </div>
      ${hasDetail ? `<div class="match-detail">${detail}</div>` : ''}
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

  list.querySelectorAll('.toggle-detail').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.match-card');
      const open = card.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
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
