/* 구글 문서에서 붙여넣은 HTML(또는 내려받은 .html) → 게시글 본문 HTML.
   src/convert.py와 같은 규칙:
   - 굵게/기울임 → <b>/<i>, 가운데·오른쪽 정렬 → class c / r
   - 문단 전체가 기울임이면 class it
   - 표(편지) → <div class="letter">, 편지 끝 날짜와 서명은 오른쪽 정렬
   - '* * *' → 장면 구분선, 마지막 '-' → 끝 표시
   - 연속 빈 줄 → 여백 하나 (gap s1~s3)
   - 맨 위 [BGM] 줄과 '00.' 같은 장 번호는 뺀다 */
window.LogConvert = (() => {
  const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const BLOCK = /^(p|h[1-6]|li|blockquote|pre)$/;
  const CONTAINER = /^(div|section|article|main|body|html|tbody|thead|tr|td|th|ul|ol|b|span|font|center|colgroup)$/;

  function weightOf(el) {
    const w = el.style && el.style.fontWeight;
    if (w) return /bold|bolder/.test(w) || parseInt(w, 10) >= 600;
    if (/^(b|strong)$/i.test(el.tagName)) return true;
    return null;
  }
  function italicOf(el) {
    const s = el.style && el.style.fontStyle;
    if (s) return s === 'italic' || s === 'oblique';
    if (/^(i|em)$/i.test(el.tagName)) return true;
    return null;
  }
  // 글자마다 가장 가까운 서식 지정을 따른다 (구글 문서는 바깥을 <b style="font-weight:normal">로 감싼다)
  function runsOf(block) {
    const runs = [];
    (function walk(node, b, i) {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) runs.push({b, i, t: ch.nodeValue.replace(/ /g, ' ')});
        else if (ch.nodeType === 1) {
          if (ch.tagName === 'BR') { runs.push({b: false, i: false, t: '\n'}); continue; }
          const wb = weightOf(ch), wi = italicOf(ch);
          walk(ch, wb === null ? b : wb, wi === null ? i : wi);
        }
      }
    })(block, false, false);
    return runs;
  }
  function alignOf(el) {
    const a = (el.style && el.style.textAlign) || el.getAttribute('align') || '';
    return /center/.test(a) ? 'center' : /right|end/.test(a) ? 'right' : 'left';
  }
  function hasBlockInside(el) {
    return !!el.querySelector('p,h1,h2,h3,h4,h5,h6,li,table,br,div,blockquote');
  }

  // DOM → 블록 목록: {k:'p', align, runs} / {k:'ts'} / {k:'te'}
  function collect(root) {
    const out = [];
    (function walk(node) {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) {
          const t = ch.nodeValue;
          if (t.trim()) t.split(/\n/).forEach(line => out.push({k: 'p', align: 'left', runs: [{b: false, i: false, t: line}]}));
          continue;
        }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName.toLowerCase();
        if (/^(style|script|meta|title|head|colgroup|col)$/.test(tag)) continue;
        if (tag === 'table') { out.push({k: 'ts'}); walk(ch); out.push({k: 'te'}); continue; }
        if (tag === 'br') { out.push({k: 'p', align: 'left', runs: []}); continue; }
        if (BLOCK.test(tag)) {
          const runs = runsOf(ch);
          if (/^h[1-6]$/.test(tag)) runs.forEach(r => { r.b = true; });
          out.push({k: 'p', align: alignOf(ch), runs});
          continue;
        }
        if (CONTAINER.test(tag) || hasBlockInside(ch)) { walk(ch); continue; }
        // 낱개 글자 요소가 바로 놓인 경우
        out.push({k: 'p', align: 'left', runs: runsOf({childNodes: [ch]})});
      }
    })(root);
    return out;
  }

  function renderRuns(runs) {
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.b === r.b && last.i === r.i) last.t += r.t;
      else merged.push({...r});
    }
    return merged.map(({b, i, t}) => {
      if (!t) return '';
      let s = esc(t).replace(/\n/g, '<br>');
      if (i && t.trim()) s = `<i>${s}</i>`;
      if (b && t.trim()) s = `<b>${s}</b>`;
      return s;
    }).join('');
  }

  function assemble(blocks) {
    const out = [];
    let blank = 0, inTable = 0, seen = false;
    const isGap = x => x && x.startsWith('<div class="gap');
    const flushBlank = () => {
      if (blank && seen) out.push(`<div class="gap s${blank === 1 ? 1 : blank <= 2 ? 2 : 3}"></div>`);
      blank = 0;
    };
    for (const blk of blocks) {
      if (blk.k === 'ts') { flushBlank(); inTable++; out.push('<div class="letter">'); continue; }
      if (blk.k === 'te') {
        inTable--;
        while (isGap(out[out.length - 1])) out.pop();
        blank = 0;
        const start = out.lastIndexOf('<div class="letter">');
        for (let j = out.length - 1; j > start; j--) {
          const txt = out[j].replace(/<[^>]+>/g, '').trim();
          if (/^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/.test(txt)) {
            for (let k = j; k < out.length; k++) out[k] = out[k].replace('<p>', '<p class="r">');
            break;
          }
        }
        out.push('</div>');
        continue;
      }
      const text = blk.runs.map(r => r.t).join('');
      const plain = text.trim();
      if (!plain) { blank++; continue; }
      if (plain.toUpperCase() === '[BGM]' || (!seen && /^\d{1,2}\.$/.test(plain))) { blank = 0; continue; }
      if (/^[*＊·\s]+$/.test(plain) && (plain.match(/[*＊]/g) || []).length >= 3) {
        blank = 0;
        while (isGap(out[out.length - 1])) out.pop();
        out.push('<p class="sep" aria-label="장면 전환"><span>✦</span></p>');
        seen = true;
        continue;
      }
      if (plain === '-' && !inTable) { blank = 0; out.push('<p class="end" aria-label="끝"><span></span></p>'); continue; }
      if (inTable) {
        const b = blank; blank = 0;
        if (b && out[out.length - 1] !== '<div class="letter">') out.push(`<div class="gap s${Math.min(b, 2)}"></div>`);
      } else flushBlank();
      seen = true;
      const cls = [];
      if (blk.align === 'center') cls.push('c'); else if (blk.align === 'right') cls.push('r');
      const textRuns = blk.runs.filter(r => r.t.trim());
      let body;
      if (textRuns.length && textRuns.every(r => r.i) && !inTable) { cls.push('it'); body = esc(text.trim()); }
      else body = renderRuns(blk.runs).trim();
      out.push(`<p${cls.length ? ` class="${cls.join(' ')}"` : ''}>${body}</p>`);
    }
    while (isGap(out[out.length - 1])) out.pop();
    return out.join('\n');
  }

  function fromHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return assemble(collect(doc.body));
  }
  function fromText(text) {
    return assemble(String(text).replace(/\r/g, '').split('\n').map(line => ({k: 'p', align: 'left', runs: [{b: false, i: false, t: line}]})));
  }
  // 목록에 보일 미리보기 문장과 공백 뺀 글자 수
  function summary(fragment) {
    const box = document.createElement('div');
    box.innerHTML = fragment;
    box.querySelectorAll('.sep,.end').forEach(el => el.remove());
    let buf = '';
    for (const p of box.querySelectorAll('p')) {
      if (/\b(num|sep|end)\b/.test(p.className)) continue;
      buf = (buf + ' ' + p.textContent.trim()).trim();
      if (buf.length >= 60) break;
    }
    const excerpt = buf.length <= 90 ? buf : buf.slice(0, 90).trimEnd() + '…';
    const chars = box.textContent.replace(/\s/g, '').length;
    return {excerpt, chars};
  }
  return {fromHTML, fromText, summary};
})();
