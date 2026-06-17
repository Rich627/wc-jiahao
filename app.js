'use strict';

const SEL_CLASS = { HOME: 'home', DRAW: 'draw', AWAY: 'away' };
const SEL_LABEL = { HOME: '主勝', DRAW: '和局', AWAY: '客勝' };
const CHIP_CLASS = { HOME: 'chip-home', DRAW: 'chip-draw', AWAY: 'chip-away' };

function escapeHtml(str) {
  return String(str)
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
  let listType = null; // 'ul' | 'ol'
  let para = [];

  function inline(text) {
    let t = escapeHtml(text);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return t;
  }
  function flushPara() {
    if (para.length) {
      html += '<p>' + inline(para.join(' ')) + '</p>';
      para = [];
    }
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

function buildProbBar(p) {
  const h = pct(p && p.H);
  const d = pct(p && p.D);
  const a = pct(p && p.A);
  const seg = (cls, v) =>
    `<div class="prob-seg ${cls}" style="flex:${v || 0.0001}">${v >= 12 ? v + '%' : ''}</div>`;
  return `
    <div class="prob-legend">
      <span>主勝 ${h}%</span><span>和局 ${d}%</span><span>客勝 ${a}%</span>
    </div>
    <div class="prob-bar">
      ${seg('h', h)}${seg('d', d)}${seg('a', a)}
    </div>`;
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
      <div class="reasoning">${renderMarkdown(m.reasoning_md)}</div>
    </div>`;
}

function chipsRowHtml(models) {
  return models
    .map((m) => {
      const cls = CHIP_CLASS[m.selection] || 'chip-draw';
      const short = escapeHtml(m.name.replace(/家豪$/, ''));
      return `<span class="chip ${cls}" title="${escapeHtml(m.name)} · ${SEL_LABEL[m.selection] || ''}">${short}</span>`;
    })
    .join('');
}

function matchCardHtml(match) {
  const c = match.consensus || {};
  const cCls = SEL_CLASS[c.selection] || 'draw';
  const winPct = c.win_prob != null ? pct(c.win_prob) + '%' : '—';
  const detail = (match.models || []).map(modelCardHtml).join('');

  return `
    <article class="match-card" id="match-${escapeHtml(match.id)}">
      <button class="match-head" type="button" aria-expanded="false">
        <div class="match-top">
          <span>🕒 ${escapeHtml(match.kickoff_tw || '')}（台灣時間）</span>
          ${match.group ? `<span class="match-group">${escapeHtml(match.group)} 組</span>` : ''}
        </div>
        <div class="teams">
          <div class="team home">
            <div class="team-name">${escapeHtml(match.home)}</div>
            <div class="team-en">${escapeHtml(match.home_en || '')}</div>
          </div>
          <div class="vs">VS</div>
          <div class="team away">
            <div class="team-name">${escapeHtml(match.away)}</div>
            <div class="team-en">${escapeHtml(match.away_en || '')}</div>
          </div>
        </div>
        <div class="consensus">
          <span class="consensus-label">共識</span>
          <span class="consensus-pick ${cCls}">${escapeHtml(c.selection_team || SEL_LABEL[c.selection] || '—')}</span>
          <span class="consensus-stat">勝率 <b>${winPct}</b></span>
          <span class="consensus-stat">比分 <b>${escapeHtml(c.predicted_score || '—')}</b></span>
          ${c.agree ? `<span class="consensus-stat">一致 <b>${escapeHtml(c.agree)}</b></span>` : ''}
        </div>
        <div class="chips-row">${chipsRowHtml(match.models || [])}</div>
        <div class="expand-hint">
          <span class="open-txt">▾ 點開看 5 個模型完整分析</span>
          <span class="closed-txt">▴ 收起</span>
        </div>
      </button>
      <div class="match-detail">${detail}</div>
    </article>`;
}

function sortByKickoff(matches) {
  return matches.slice().sort((a, b) => {
    const ka = a.kickoff_tw || '';
    const kb = b.kickoff_tw || '';
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function render(data) {
  const list = document.getElementById('match-list');
  const gen = document.getElementById('generated-at');

  if (data.generated_at) {
    gen.textContent = '更新時間：' + data.generated_at.replace('T', ' ').replace(/(\+\d{2}:\d{2})$/, '');
  }

  const matches = sortByKickoff(data.matches || []);
  if (!matches.length) {
    list.innerHTML = '<p class="loading">目前沒有比賽預測。</p>';
    return;
  }
  list.innerHTML = matches.map(matchCardHtml).join('');

  list.querySelectorAll('.match-head').forEach((btn) => {
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
    '<div class="error-box">載入預測資料失敗：' + escapeHtml(msg) +
    '<br><br>若以 file:// 開啟，部分瀏覽器會封鎖 fetch，請改用 <code>python3 -m http.server</code> 開啟本站。</div>';
}

fetch('data/predictions.json', { cache: 'no-store' })
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(render)
  .catch((err) => showError(err.message || String(err)));
