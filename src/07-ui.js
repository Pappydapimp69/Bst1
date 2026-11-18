// ---------------------------------------------------------------- interface: HUD, cards, journal, menu navigation
const UI = {
  ov: null, openedAt: 0, ret: null, jTab: 'signs', jWord: -1, lastHint: '', armT: 0, jMsg: '',
  layout() {
    // layout follows the screen's orientation and size right now; controls follow the device used last
    const mq = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;
    const land = mq ? mq.matches && innerWidth > innerHeight * 1.05 : innerWidth > innerHeight * 1.05;
    document.body.classList.toggle('land', land);
  },
  hints() {
    const set = (id, a) => { const el = $(id).querySelector('.k'); el.textContent = Input.device === 'touch' ? '' : Input.hint(a); };
    set('bSing', 'sing'); set('bNote', 'note'); set('bStop', 'stop'); set('bJournal', 'journal'); set('bMenu', 'menu');
    $('jCloseK').textContent = Input.device === 'touch' ? '' : '(' + Input.hint('back') + ')';
    this.lastHint = '';
  },
  hud() {
    const J = G.J; if (!J) return;
    $('nightLbl').textContent = 'Night ' + (G.mode === 'dawn' ? J.night - 1 : J.night);
    const conf = J.words.filter((w) => w.confirmed).length;
    $('signLbl').textContent = `Signs ${conf}/${WORDS.length}`;
  },
  hintText() {
    const J = G.J, d = Input.device;
    if (G.msgT > 0) return G.msg;
    if (J.tut === 0) return d === 'touch' ? 'Draw a path from the keeper with your finger.' : d === 'pad' ? 'Walk with the left stick.' : d === 'mouse' ? 'Drag from the keeper to draw a path, or use the arrow keys.' : 'Walk with the arrow keys or WASD.';
    if (J.tut === 1) return 'Your lantern lights the shore. Walk toward a faint glow and listen.';
    if (J.tut === 2) return d === 'touch' ? 'Something sang. Tap it to note it.' : d === 'mouse' ? 'Something sang. Click it to note it.' : `Something sang. Press ${Input.hint('note')} to note it.`;
    if (J.tut === 3) return d === 'touch' || d === 'mouse' ? 'Open the journal.' : `Open the journal with ${Input.hint('journal')}.`;
    const f = G.tideFrac;
    if (G.towerLit) return 'The lamp is lit. Walk where you like until the tide is high.';
    if (G.W.bells.some((b) => G.L < b.h + SHALLOW) && f < 0.32) return f < 0.12 ? 'Low water. The drowned village is open.' : 'The water is turning. The low places will not stay open long.';
    if (f > 0.85) return 'High water is near. The night is ending.';
    return 'The tide is rising, slowly. Sing, listen, and note what the lantern finds.';
  },
  frame(dt) {
    if (!G.J) return;
    if (G.mode === 'play') {
      const t = this.hintText();
      if (t !== this.lastHint) { $('hint').textContent = t; this.lastHint = t; }
      const f = G.tideFrac;
      $('tideFill').style.width = (f * 100).toFixed(1) + '%';
      const lbl = f < 0.15 ? 'Low water' : f < 0.5 ? 'Flooding' : f < 0.9 ? 'Rising' : 'High water';
      if ($('tideLbl').textContent !== lbl) $('tideLbl').textContent = lbl;
      $('bJournal').classList.toggle('glow', G.J.tut === 3);
    }
    this.soundNote();
  },
  soundNote() {
    const waiting = settings.sound && G.mode === 'play' && (!Sound.ctx || Sound.ctx.state !== 'running');
    $('soundNote').hidden = !waiting;
    $('soundNote').textContent = Input.device === 'pad' ? 'Sound waits: press any key or tap once' : 'Sound waits for a tap or key';
  },
  toast(t) { /* short notes go through the hint row */ say(t, 2.5); },
  // --- overlays
  open(id, ret) {
    if (this.ov) $(this.ov).hidden = true;
    this.ov = id; this.ret = ret || null; this.openedAt = performance.now();
    Input.releaseAll(); Input.latchHeld();
    const el = $(id); el.hidden = false;
    if (id === 'title') this.paintTitle();
    if (id === 'pause') this.paintPause();
    const list = this.focusables(), f = list.find((b) => b.getAttribute('aria-disabled') !== 'true') || list[0];
    if (f) f.focus({ preventScroll: true });
  },
  close() {
    if (!this.ov) return;
    $(this.ov).hidden = true;
    const r = this.ret; this.ov = null; this.ret = null;
    Input.latchHeld();
    if (r) this.open(r);
  },
  focusables() {
    if (!this.ov) return [];
    return [...$(this.ov).querySelectorAll('button')].filter((b) => b.offsetParent !== null && !b.hidden);
  },
  nav(dx, dy) {
    const list = this.focusables(); if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    if (i < 0) { list[0].focus(); return; }
    const from = list[i].getBoundingClientRect(), fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    let best = -1, bs = Infinity;
    list.forEach((b, j) => {
      if (j === i) return;
      const r = b.getBoundingClientRect(), vx = r.left + r.width / 2 - fx, vy = r.top + r.height / 2 - fy;
      const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
      if (along <= 4) return;
      const sc = along + across * 2;
      if (sc < bs) { bs = sc; best = j; }
    });
    if (best < 0) return;
    list[best].focus(); list[best].scrollIntoView({ block: 'nearest' });
  },
  ready() { return performance.now() - this.openedAt > 700; },
  activate() {
    if (!this.ready()) return;
    const el = document.activeElement;
    if (el && el.tagName === 'BUTTON' && this.focusables().includes(el)) el.click();
    else { const f = this.focusables()[0]; if (f) f.focus(); }
  },
  back() {
    if (!this.ready()) return;
    if (this.ov === 'journal') { if (this.jWord >= 0) { this.jWord = -1; this.paintJournal(); } else this.closeJournal(); }
    else if (this.ov === 'pause') this.resume();
    else if (this.ov === 'dawn') { /* dawn waits for the player to choose */ }
  },
  key(e) {
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.code]) { e.preventDefault(); this.nav(...dirs[e.code]); return; }
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.back(); return; }
    if ((e.code === 'KeyJ' || e.code === 'Tab') && this.ov === 'journal') { e.preventDefault(); this.back(); return; }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.activate(); }
  },
  resume() { this.close(); if (G.mode === 'play') say('Back on the shore.', 1.2); },
  // --- title and pause
  paintTitle() {
    const has = !!storeGet(store, KEY_SAVE);
    const c = $('tContinue');
    c.textContent = has ? `Continue: night ${G.J.night}` : 'Continue (no saved journal yet)';
    c.setAttribute('aria-disabled', has ? 'false' : 'true');
    $('tNew').textContent = 'New journal';
    this.paintToggles();
  },
  paintPause() { this.paintToggles(); $('pNote').textContent = `Night ${G.J.night}. The journal and the moss are kept.`; },
  paintToggles() {
    const s = 'Sound: ' + (settings.sound ? 'on' : 'off'), m = 'Motion: ' + settings.motion;
    $('tSound').textContent = s; $('pSound').textContent = s; $('tMotion').textContent = m; $('pMotion').textContent = m;
  },
  // --- journal
  openJournal(ret) {
    this.jWord = -1; this.jTab = 'signs'; this.jMsg = '';
    if (G.J.tut === 3) { G.J.tut = 4; persist(); }
    this.open('journal', ret); this.paintJournal();
  },
  closeJournal() {
    if (G.J.tut === 4) { G.J.tut = 5; persist(); }
    this.close();
  },
  paintJournal(keepKey) {
    const J = G.J, body = $('jBody');
    const focusKey = keepKey || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.key);
    $('jTabSigns').setAttribute('aria-selected', this.jTab === 'signs'); $('jTabShore').setAttribute('aria-selected', this.jTab === 'shore');
    body.innerHTML = '';
    if (this.jTab === 'signs' && this.jWord < 0) {
      $('jHint').textContent = J.tut <= 5 && !J.words.some((w) => w.guess >= 0) ? 'Pick a sign, then the picture you think it means. A sign heard in two places can be confirmed.' : 'Signs you have heard. Faint ones have not been heard for a night or more.';
      const grid = document.createElement('div'); grid.className = 'signs';
      const heard = J.words.map((w, i) => i).filter((i) => J.words[i].heard.length);
      for (const wi of heard) {
        const st = J.words[wi], b = document.createElement('button');
        b.className = 'btn sign'; b.dataset.key = 'w' + wi;
        const cv = glyphCanvas(wi, 40, st.confirmed ? COL.lantern : COL.glyph, [1, 0.8, 0.62, 0.45][st.fade]);
        b.appendChild(cv);
        const t = document.createElement('span'); t.className = 'st';
        t.textContent = st.confirmed ? (st.fade >= 3 ? 'confirmed, faded' : 'confirmed') : st.guess >= 0 ? 'pencilled' : `heard in ${st.heard.length} place${st.heard.length > 1 ? 's' : ''}`;
        if (st.guess >= 0) { const pc = picCanvas(WORDS[st.guess].pic, 22, st.confirmed ? COL.lantern : COL.glyph); b.appendChild(pc); }
        b.appendChild(t);
        b.onclick = () => { this.jWord = wi; this.jMsg = ''; this.paintJournal('back'); };
        grid.appendChild(b);
      }
      body.appendChild(grid);
      const rest = WORDS.length - heard.length;
      const p = document.createElement('p'); p.className = 'sub';
      p.textContent = heard.length ? (rest ? `${rest} more sign${rest > 1 ? 's' : ''} not heard yet.` : 'Every sign has been heard.') : 'No signs heard yet. Walk near a glowing creature and listen.';
      body.appendChild(p);
    } else if (this.jTab === 'signs') {
      const wi = this.jWord, st = J.words[wi];
      $('jHint').textContent = st.confirmed ? 'Confirmed: it fits every place you heard it.' : 'Choose the picture this sign means. It is checked against the places you heard it.';
      const back = mkBtn('Back to signs', () => { this.jWord = -1; this.paintJournal('w' + wi); }); back.dataset.key = 'back';
      body.appendChild(back);
      const det = document.createElement('div'); det.className = 'detail';
      det.appendChild(glyphCanvas(wi, 64, st.confirmed ? COL.lantern : COL.glyph, 1));
      const info = document.createElement('div');
      const s1 = document.createElement('div'); s1.className = 'status';
      s1.textContent = st.confirmed ? `It means: ${WORDS[wi].name}.` : st.guess >= 0 ? `Pencilled: ${WORDS[st.guess].name}?` : 'Meaning unknown.';
      info.appendChild(s1);
      if (this.jMsg) { const m = document.createElement('div'); m.className = 'sub'; m.textContent = this.jMsg; info.appendChild(m); }
      det.appendChild(info); body.appendChild(det);
      const h = document.createElement('div'); h.className = 'sub'; h.textContent = 'Heard in:'; body.appendChild(h);
      for (const pid of st.heard) {
        const P = PHRASES[PI_[pid]], row = document.createElement('div'); row.className = 'phr';
        row.appendChild(phraseCanvas(P, wi));
        const sk = document.createElement('canvas'); const n = P.sketch.length; sk.width = n * 40 * 2; sk.height = 72; sk.style.width = n * 40 + 'px'; sk.style.height = '36px';
        const sc = sk.getContext('2d'); sc.scale(2, 2); P.sketch.forEach((nm, i) => drawPic(sc, nm, i * 40 + 2, 1, 34, '#b8d8e8'));
        row.appendChild(sk);
        body.appendChild(row);
      }
      if (!st.confirmed) {
        const ch = document.createElement('div'); ch.className = 'choices';
        WORDS.forEach((w, k) => {
          const b = document.createElement('button'); b.className = 'btn choice' + (st.guess === k ? ' sel' : ''); b.dataset.key = 'c' + k;
          b.setAttribute('aria-label', w.name);
          b.appendChild(picCanvas(w.pic, 36, COL.glyph));
          b.onclick = () => this.guess(wi, k);
          ch.appendChild(b);
        });
        body.appendChild(ch);
        if (st.guess >= 0) { const cl = mkBtn('Rub out the guess', () => { st.guess = -1; this.jMsg = ''; persist(); this.paintJournal('clear'); }); cl.dataset.key = 'clear'; cl.style.marginTop = '8px'; body.appendChild(cl); }
      }
    } else {
      $('jHint').textContent = 'Your chart of the shore, and what the lantern has shown you.';
      const cv = document.createElement('canvas'); const w = Math.min(body.clientWidth - 8 || 300, 420);
      cv.width = w * 2; cv.height = w * 2; cv.style.width = w + 'px'; cv.style.height = w + 'px'; cv.style.display = 'block'; cv.style.margin = '0 auto';
      drawChart(cv.getContext('2d'), w);
      body.appendChild(cv);
      const p = document.createElement('p'); p.className = 'sub';
      const seen = Object.entries(J.seen).filter(([k, v]) => v > 0 && KIND_NAMES[k]).map(([k, v]) => `${KIND_NAMES[k]} (${v})`);
      p.textContent = seen.length ? 'Noted: ' + seen.join(', ') + '.' : 'Nothing noted yet. Tap or note what the lantern lights.';
      body.appendChild(p);
      const p2 = document.createElement('p'); p2.className = 'sub';
      p2.textContent = `Nights walked: ${J.night - 1}. ` + (J.phantoms.length ? `Islands that were not there: ${J.phantoms.length}. ` : '') + (J.lit ? 'The lamp has been lit.' : 'The lamp is cold.');
      body.appendChild(p2);
    }
    // keep focus on what was pressed, or the next thing in its place
    const want = focusKey && body.querySelector(`[data-key="${focusKey}"]`);
    if (want) want.focus({ preventScroll: false }); else if (this.ov === 'journal') { const f = body.querySelector('button') || $('jClose'); f.focus({ preventScroll: true }); }
  },
  guess(wi, k) {
    const st = G.J.words[wi];
    st.guess = k;
    const ok = checkConfirm();
    if (st.confirmed) this.jMsg = 'It fits both places. Confirmed.';
    else if (st.heard.length < 2) this.jMsg = 'Pencilled in. Hear it in a second place to be sure.';
    else { this.jMsg = 'Pencilled in, but it does not fit every place it was heard.'; Sound.chime(false); }
    persist(); UI.hud();
    this.paintJournal(ok ? 'back' : 'c' + k);
  },
  showDawn(sum) {
    const J = G.J;
    $('dTitle').textContent = `Dawn. Night ${sum.night} ends.`;
    drawDawnPic($('dPic'), sum);
    const b = $('dBody'); b.innerHTML = '';
    const lines = [
      sum.heard.length ? `You heard ${sum.heard.length} phrase${sum.heard.length > 1 ? 's' : ''} tonight.` : 'No creature sang to you tonight.',
      `Signs confirmed: ${sum.confirmed} of ${WORDS.length}.`,
      sum.mossGain > 0.5 ? 'The foxfire spread along the paths you walked. It will light the start of tomorrow.' : 'The foxfire waits for paths to grow along.',
      'The tide takes the lit shore, the rung bells, the village. The journal and the moss stay.',
    ];
    for (const t of lines) { const p = document.createElement('p'); p.textContent = t; b.appendChild(p); }
    if (sum.faded.length) {
      const p = document.createElement('p'); p.className = 'sub'; p.textContent = 'Signs not heard tonight grew faint: '; b.appendChild(p);
      const r = document.createElement('div'); r.className = 'row';
      for (const wi of sum.faded) r.appendChild(glyphCanvas(wi, 30, COL.glyph, [1, 0.8, 0.62, 0.45][J.words[wi].fade]));
      b.appendChild(r);
    }
    this.hud();
    this.open('dawn');
  },
  showEnding() {
    G.J.ended = true; persist();
    drawEndingPic($('ePic'));
    $('eLine1').textContent = 'The lamp turns. Out on the water, three small lights turn with it.';
    $('eLine2').textContent = 'The other keepers never left. They went down to ring the bells, and stayed to sing.';
    this.open('ending');
  },
};
function mkBtn(text, fn) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = text; b.onclick = fn; return b; }
function glyphCanvas(wi, px, ink, alpha) {
  const cv = document.createElement('canvas'); cv.width = px * 2; cv.height = px * 2; cv.style.width = px + 'px'; cv.style.height = px + 'px';
  const c = cv.getContext('2d'); c.scale(2, 2); c.globalAlpha = alpha == null ? 1 : alpha; drawGlyph(c, wi, px * 0.1, px * 0.1, px * 0.8, ink, 1.1);
  cv.setAttribute('aria-hidden', 'true'); return cv;
}
function picCanvas(name, px, ink) {
  const cv = document.createElement('canvas'); cv.width = px * 2; cv.height = px * 2; cv.style.width = px + 'px'; cv.style.height = px + 'px';
  const c = cv.getContext('2d'); c.scale(2, 2); drawPic(c, name, 0, 0, px, ink); cv.setAttribute('aria-hidden', 'true'); return cv;
}
function phraseCanvas(P, hi) {
  const n = P.w.length, gs = 28, w = n * (gs + 6), cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = (gs + 18) * 2; cv.style.width = w + 'px'; cv.style.height = gs + 18 + 'px';
  const c = cv.getContext('2d'); c.scale(2, 2);
  P.w.forEach((word, i) => {
    const wi = WI[word], st = G.J.words[wi], x = i * (gs + 6);
    if (wi === hi) { c.fillStyle = 'rgba(255,196,107,0.18)'; c.fillRect(x - 2, 0, gs + 4, gs + 2); }
    const tr = st.confirmed && st.fade < 3;
    drawGlyph(c, wi, x + 2, 2, gs - 4, tr ? COL.lantern : COL.glyph, 1.2);
    if (tr) drawPic(c, WORDS[wi].pic, x + 7, gs + 1, 16, COL.lantern);
  });
  return cv;
}
function drawChart(c, w) {
  c.scale(2, 2);
  c.fillStyle = '#0b1424'; c.fillRect(0, 0, w, w);
  const k = w / 110, W = G.W, ox = 3;
  // coast at mid-tide from tonight's shore
  const L = tideLevel(0.35);
  c.fillStyle = '#3a3a33';
  for (let y = -2; y < 108; y += 1.5) for (let x = -2; x < 108; x += 1.5) if (sampleH(W, x, y) > L) c.fillRect((x + ox) * k, (y + ox) * k, 1.5 * k + 0.5, 1.5 * k + 0.5);
  c.strokeStyle = 'rgba(184,216,232,0.5)'; c.lineWidth = 1; c.strokeRect(1, 1, w - 2, w - 2);
  drawPic(c, 'tower', (TOWER.x + ox) * k - 12, (TOWER.y + ox) * k - 14, 24, '#ece6d6');
  for (const ch of G.J.chart) { c.save(); drawPic(c, 'stone', (ch.x + ox) * k - 8, (ch.y + ox) * k - 8, 16, '#b8d8e8'); c.restore(); }
  for (const ph of G.J.phantoms) { c.setLineDash([3, 3]); c.strokeStyle = '#ece6d6'; c.beginPath(); c.arc((ph.x + ox) * k, (ph.y + ox) * k, 8, 0, 7); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#ece6d6'; c.font = '12px Georgia, serif'; c.textAlign = 'center'; c.fillText('?', (ph.x + ox) * k, (ph.y + ox) * k + 4); }
  // moss, as the garden stands
  c.fillStyle = 'rgba(127,240,196,0.7)';
  for (let j = 0; j < MOSS_N; j += 2) for (let i = 0; i < MOSS_N; i += 2) { const m = G.moss[j * MOSS_N + i]; if (m > 0.2) c.fillRect((MOSS_X0 + i + ox) * k, (MOSS_Y0 + j + ox) * k, 1.6 * k * m + 0.5, 1.6 * k * m + 0.5); }
  c.fillStyle = '#ece6d6'; c.font = '12px Georgia, serif'; c.textAlign = 'left';
  c.fillText('lighthouse', (TOWER.x + ox) * k + 14, (TOWER.y + ox) * k + 4);
}
function drawDawnPic(cv, sum) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b3756'); g.addColorStop(0.55, '#c7a98f'); g.addColorStop(0.62, '#dcc6a8'); g.addColorStop(0.63, '#3a4f66'); g.addColorStop(1, '#16243a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,240,215,0.85)'; c.beginPath(); c.arc(w * 0.72, h * 0.63, 16, Math.PI, 0); c.fill();
  c.fillStyle = '#141a26'; c.beginPath(); c.moveTo(w * 0.08, h * 0.64); c.lineTo(w * 0.1, h * 0.25); c.lineTo(w * 0.135, h * 0.25); c.lineTo(w * 0.155, h * 0.64); c.fill();
  c.fillRect(w * 0.095, h * 0.18, w * 0.05, h * 0.08);
  c.fillRect(0, h * 0.62, w * 0.3, h * 0.05);
  const heard = new Set(); for (const p of sum.heard) for (const wd of PHRASES[p].w) heard.add(WI[wd]);
  const list = [...heard].slice(0, 12);
  list.forEach((wi, i) => drawGlyph(c, wi, w * 0.25 + i * 26, h * 0.12, 20, 'rgba(241,235,220,0.9)', 1.2));
  c.strokeStyle = 'rgba(255,240,215,0.35)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(w * 0.6 + i * 6, h * (0.7 + i * 0.05)); c.lineTo(w * 0.84 - i * 6, h * (0.7 + i * 0.05)); c.stroke(); }
}
function drawEndingPic(cv) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060a16'); g.addColorStop(0.5, '#0e1730'); g.addColorStop(0.52, '#0a1a2c'); g.addColorStop(1, '#040a14');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(230,230,255,${0.2 + hash2(i, 1, 5) * 0.5})`; c.fillRect(hash2(i, 2, 5) * w, hash2(i, 3, 5) * h * 0.48, 1.2, 1.2); }
  const tx = w * 0.8, ty = h * 0.22;
  c.fillStyle = '#0a0e18'; c.beginPath(); c.moveTo(tx - 16, h * 0.52); c.lineTo(tx - 9, ty); c.lineTo(tx + 9, ty); c.lineTo(tx + 16, h * 0.52); c.fill();
  c.fillRect(w * 0.62, h * 0.5, w * 0.38, h * 0.04);
  c.globalCompositeOperation = 'lighter';
  const bg = c.createLinearGradient(tx, ty, 0, ty + 40); bg.addColorStop(0, 'rgba(255,226,160,0.55)'); bg.addColorStop(1, 'rgba(255,226,160,0)');
  c.fillStyle = bg; c.beginPath(); c.moveTo(tx, ty - 4); c.lineTo(0, ty - 30); c.lineTo(0, ty + 70); c.closePath(); c.fill();
  radial(c, tx, ty - 6, 40, 'rgba(255,220,150,0.8)');
  // three small lights on the water where the village drowned, and their reflections
  [[0.25, 0.62], [0.36, 0.66], [0.47, 0.61]].forEach(([fx, fy]) => {
    radial(c, w * fx, h * fy, 14, 'rgba(255,200,120,0.7)');
    for (let i = 1; i < 6; i++) { c.fillStyle = `rgba(255,200,120,${0.18 / i})`; c.fillRect(w * fx - 6 + i, h * fy + i * 7, 12 - i * 2, 2); }
  });
  // moths circling the lamp
  for (let i = 0; i < 5; i++) { const a = i * 1.25; radial(c, tx + Math.cos(a) * 26, ty - 6 + Math.sin(a) * 14, 5, 'rgba(239,228,200,0.7)'); }
  c.globalCompositeOperation = 'source-over';
}
function bindUI() {
  for (const b of document.querySelectorAll('#bar .hb')) b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (G.mode !== 'play') return;
    if (a === 'note') {
      // on touch the button notes the nearest lit thing; a tap on the shore does the same for what was tapped
      observe(G.noteTarget);
    } else act(a);
  });
  // cards ignore input for 0.7 s after opening, so a press meant for the shore cannot reach them
  document.addEventListener('click', (e) => { if (UI.ov && !UI.ready() && $(UI.ov).contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }, true);
  $('tContinue').onclick = () => {
    if ($('tContinue').getAttribute('aria-disabled') === 'true') { $('tNote').textContent = 'There is no saved journal yet. Start a new one.'; return; }
    UI.close(); startNight();
  };
  $('tNew').onclick = () => {
    const has = !!storeGet(store, KEY_SAVE);
    if (has && (!UI.armT || performance.now() - UI.armT > 4000)) { UI.armT = performance.now(); $('tNew').textContent = 'Press again to erase the journal and the moss'; return; }
    UI.armT = 0;
    newJournal(); UI.close(); startNight();
  };
  const tSound = () => { settings.sound = !settings.sound; Sound.setMuted(!settings.sound); saveSettings(); UI.paintToggles(); };
  const tMotion = () => { const o = ['system', 'full', 'reduced']; settings.motion = o[(o.indexOf(settings.motion) + 1) % 3]; saveSettings(); UI.paintToggles(); };
  $('tSound').onclick = tSound; $('pSound').onclick = tSound; $('tMotion').onclick = tMotion; $('pMotion').onclick = tMotion;
  $('pResume').onclick = () => UI.resume();
  $('pJournal').onclick = () => UI.openJournal('pause');
  $('pTitle').onclick = () => { persist(); G.mode = 'title'; UI.close(); UI.open('title'); };
  $('jTabSigns').onclick = () => { UI.jTab = 'signs'; UI.jWord = -1; UI.paintJournal('tabS'); };
  $('jTabShore').onclick = () => { UI.jTab = 'shore'; UI.paintJournal('tabH'); };
  $('jTabSigns').dataset.key = 'tabS'; $('jTabShore').dataset.key = 'tabH';
  $('jClose').onclick = () => UI.closeJournal();
  $('dNext').onclick = () => { UI.close(); startNight(); };
  $('dJournal').onclick = () => UI.openJournal('dawn');
  $('eOn').onclick = () => { UI.close(); say('The lamp keeps turning. The nights go on, gently.', 4); };
  $('eTitle').onclick = () => { persist(); G.mode = 'title'; UI.close(); UI.open('title'); };
}
