/* 内定者ポータル 画面の処理
 * URL: ?c=会社コード&k=個別キー
 * ログイン状態と最後に読んだデータは端末（localStorage）に保存し、次回はすぐ表示してから最新を取りに行く。
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const C = params.get('c') || '';
  const K = params.get('k') || '';
  const API = (window.PORTAL_CLIENTS || {})[C];
  const STORE_KEY = `naitei:${C}:${K}`;
  const WEEK = '日月火水木金土';
  const TEMPLATES = { 'スタンダード': 'standard', 'やわらか': 'soft', 'きちんと': 'bold' };
  const DEFAULT_TEXTS = {
    '挨拶': '{名前}さん、入社までよろしくお願いします',
    '見出し_やること': '今やること', '見出し_予定': 'これからの予定', '見出し_お知らせ': 'お知らせ',
    '見出し_リンク': '公式リンク', '見出し_ギャラリー': '職場の様子', '見出し_コンテンツ': '会社を知る',
    'メニュー_ホーム': 'ホーム', 'メニュー_やること': 'やること', 'メニュー_予定': '予定',
    'メニュー_お知らせ': 'お知らせ', 'メニュー_会社を知る': '会社を知る',
    'ログイン説明': 'ご案内したパスワード',
    'やることがないとき': '今やることはありません。おつかれさまでした。',
    'ページ下の注意書き': 'このページはあなた専用です。URLとパスワードは他の人に共有しないでください。',
  };

  let D = null; // サーバーから受け取ったデータ
  let currentTab = 'home';

  /* ---------- 保存 ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* 保存できない環境でも動かす */ } },
    patch(v) { this.set(Object.assign(this.get(), v)); },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ } },
  };

  /* ---------- 通信 ---------- */
  async function api(body) {
    // text/plain で送ると事前確認（CORS プリフライト）が発生しない
    const res = await fetch(API, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  /* ---------- 小道具 ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\r?\n/g, '<br>');
  const t = key => {
    const v = (D && D.texts && D.texts[key]) || DEFAULT_TEXTS[key] || '';
    return String(v).replace(/\{名前\}/g, D && D.me ? D.me.name : '');
  };
  const pd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const md = s => { const d = pd(s); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`; };
  const today = () => D && D.today ? pd(D.today) : new Date(new Date().toDateString());
  const daysUntil = s => Math.round((pd(s) - today()) / 864e5);
  const ICON = {
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H6v18h12V7zM14 3v4h4"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-3 1-4 4 1 5-2 1-4-4-5 5-1-1 5-5-4-4 1-2 5 1 4-4z"/></svg>',
  };
  const linksHtml = links => (links && links.length)
    ? `<div class="links">${links.map(l => `<a class="lk" href="${esc(l.url)}" target="_blank" rel="noopener">${l.file ? ICON.file : ICON.link}${esc(l.label)}</a>`).join('')}</div>`
    : '';

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  /* ---------- 画面の切り替え ---------- */
  function show(view) {
    ['v-state', 'v-login', 'v-main'].forEach(id => { $(id).hidden = id !== view; });
  }
  function showState(msg, loading) {
    $('state-msg').textContent = msg;
    $('spinner').hidden = !loading;
    show('v-state');
  }

  function applyTheme(company) {
    if (!company) return;
    if (company.color && /^#[0-9a-f]{3,8}$/i.test(company.color)) document.documentElement.style.setProperty('--accent', company.color);
    $('app').dataset.tpl = TEMPLATES[company.template] || 'standard';
    const img = $('hero-img');
    if (company.hero) img.style.setProperty('--hero', `url("${company.hero.replace(/"/g, '%22')}")`);
    else img.style.removeProperty('--hero');
    document.title = company.portal ? `${company.portal}｜${company.name || ''}` : '内定者ポータル';
  }

  /* ---------- 起動 ---------- */
  function boot() {
    if (!API || !K) {
      showState('URLが正しくありません。お送りしたURLをもう一度開いてください。', false);
      return;
    }
    const s = store.get();
    if (s.token && s.expires > Date.now()) {
      if (s.data) { D = s.data; render(); } else showState('読み込み中…', true);
      load(s.token);
    } else {
      if (s.data) applyTheme(s.data.company);
      showLogin();
    }
  }

  async function load(token) {
    try {
      const res = await api({ action: 'data', token });
      if (!res.ok) {
        if (res.error === 'auth') {
          store.clear();
          D = null;
          showLogin('ログインの有効期限が切れました。もう一度パスワードを入力してください。');
          return;
        }
        throw new Error(res.error);
      }
      D = res;
      store.patch({ data: res });
      render();
    } catch (e) {
      if (!D) showState('読み込みに失敗しました。通信環境を確認して、ページを再読み込みしてください。', false);
      else toast('最新の情報を読み込めませんでした');
    }
  }

  /* ---------- ログイン ---------- */
  async function showLogin(message) {
    show('v-login');
    $('login-err').hidden = !message;
    $('login-err').textContent = message || '';
    try {
      const res = await api({ action: 'meta', k: K });
      if (!res.ok) {
        if (res.error === 'invalid') showState('このURLは使えません。お手数ですが採用担当までご連絡ください。', false);
        return;
      }
      applyTheme(res.company);
      $('login-co').textContent = [res.company.name, res.company.portal].filter(Boolean).join('　');
      if (res.texts && res.texts['ログイン説明']) $('login-label').textContent = res.texts['ログイン説明'];
      if (res.company.contact) $('login-contact').textContent = `パスワードがわからない場合は、${res.company.contact}までご連絡ください。`;
    } catch (e) { /* 社名が出せなくてもログインはできる */ }
  }

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('pw').value.trim();
    const err = $('login-err');
    if (!pw) { err.textContent = 'パスワードを入力してください。'; err.hidden = false; return; }
    const btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = '確認中…';
    try {
      const res = await api({ action: 'login', k: K, password: pw });
      if (res.ok) {
        store.set({ token: res.token, expires: res.expires });
        $('pw').value = '';
        showState('読み込み中…', true);
        await load(res.token);
        return;
      }
      if (res.error === 'locked') err.textContent = `パスワードを続けて間違えたため、ロックしています。${res.minutes}分ほど待ってから、もう一度お試しください。`;
      else if (res.remaining != null) err.textContent = `パスワードが違います（あと${res.remaining}回間違えると、しばらくロックされます）。`;
      else err.textContent = 'パスワードが違います。';
      err.hidden = false;
    } catch (ex) {
      err.textContent = '通信に失敗しました。通信環境を確認して、もう一度お試しください。';
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'ポータルを開く';
    }
  });

  $('logout').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'もう一度押すとログアウトします';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'この端末からログアウト'; }, 4000);
      return;
    }
    store.clear();
    location.reload();
  });

  /* ---------- 描画 ---------- */
  function render() {
    applyTheme(D.company);
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    renderHero();
    renderTodos();
    renderEvents();
    renderNews();
    renderLinks();
    renderGallery();
    renderContents();
    $('foot-note').textContent = t('ページ下の注意書き');
    setTab(currentTab);
    show('v-main');
  }

  function renderHero() {
    const c = D.company;
    $('hero-co').textContent = [c.name, c.portal].filter(Boolean).join('　');
    $('hero-hello').textContent = t('挨拶');
    const newCount = D.news.filter(n => n.isNew).length + D.tasks.filter(x => x.isNew).length + D.events.filter(x => x.isNew).length;
    $('hero-sub').textContent = newCount ? `新しい案内が${newCount}件あります` : '';
  }

  /* やること */
  function dueLabel(task) {
    if (!task.due) return ['later', '期限なし'];
    const n = daysUntil(task.due);
    if (n < 0) return ['due', `期限切れ・${md(task.due)}まで`];
    if (n === 0) return ['due', '今日まで'];
    if (n <= (D.company.dueSoonDays || 7)) return ['due', `あと${n}日・${md(task.due)}まで`];
    return ['later', `${md(task.due)}まで`];
  }

  function renderTodos() {
    const active = D.tasks.filter(x => x.state < 2)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = D.tasks.filter(x => x.state === 2)
      .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

    $('todos').innerHTML = active.length ? active.map(x => {
      const [cls, label] = dueLabel(x);
      const steps = x.confirmOnly
        ? `<div class="steps one"><button class="step" type="button" data-task="${esc(x.id)}" data-state="2">確認した</button></div>`
        : `<div class="steps">
            <button class="step" type="button" aria-pressed="${x.state >= 1}" data-task="${esc(x.id)}" data-state="${x.state >= 1 ? 0 : 1}">${x.state >= 1 ? '✓ ' : ''}確認した</button>
            <button class="step" type="button" aria-pressed="false" data-task="${esc(x.id)}" data-state="2" ${x.state < 1 ? 'disabled' : ''}>対応した</button>
          </div>`;
      return `<article class="card todo">
        <div><h3>${esc(x.title)}</h3>
          <div class="meta">${x.isNew ? '<span class="pill new">NEW</span>' : ''}<span class="pill ${cls}">${label}</span>${x.state === 1 ? '<span>確認済・対応待ち</span>' : ''}</div>
          ${x.desc ? `<p>${nl2br(x.desc)}</p>` : ''}</div>
        ${linksHtml(x.links)}
        ${steps}
      </article>`;
    }).join('') : `<div class="card"><p class="empty">${esc(t('やることがないとき'))}</p></div>`;

    $('done-fold').hidden = !done.length;
    $('done-sum').textContent = `完了したこと（${done.length}件）`;
    $('donelist').innerHTML = done.map(x => `<div class="donerow"><span class="ck">✓</span><span class="t">${esc(x.title)}</span>
      <span class="meta">${x.doneAt ? md(x.doneAt).replace(/（.）/, '') : ''}<button class="del" type="button" data-task="${esc(x.id)}" data-state="${x.confirmOnly ? 0 : 1}">戻す</button></span></div>`).join('');

    const total = D.tasks.length;
    $('todo-cnt').textContent = `${active.length}件`;
    $('prog-t').textContent = `${done.length} / ${total}`;
    $('prog-b').style.width = total ? `${done.length / total * 100}%` : '0';
    $('dot-todo').hidden = !active.some(x => x.state === 0);
  }

  async function setTaskState(id, state) {
    const task = D.tasks.find(x => x.id === id);
    if (!task) return;
    const before = { state: task.state, doneAt: task.doneAt };
    task.state = state;
    task.doneAt = state === 2 ? D.today : '';
    renderTodos();
    try {
      const res = await api({ action: 'check', token: store.get().token, taskId: id, state });
      if (!res.ok) throw new Error(res.error);
      task.doneAt = res.doneAt || task.doneAt;
      store.patch({ data: D });
      if (state === 2) toast('完了にしました');
    } catch (e) {
      Object.assign(task, before);
      renderTodos();
      toast('保存できませんでした。もう一度お試しください');
    }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-task]');
    if (b && !b.disabled) setTaskState(b.dataset.task, Number(b.dataset.state));
  });

  /* 予定 */
  function renderEvents() {
    const list = D.events.filter(x => daysUntil(x.date) >= 0);
    $('events').innerHTML = list.length ? list.map(x => {
      const d = pd(x.date);
      const time = [x.start, x.end].filter(Boolean).join('〜');
      return `<article class="card ev${x.mine ? ' mine' : ''}">
        <div class="date"><div class="m">${d.getMonth() + 1}月</div><div class="d">${d.getDate()}</div><div class="w">${WEEK[d.getDay()]}</div></div>
        <div style="min-width:0"><h3>${esc(x.title)}</h3>
          <div class="meta">${x.isNew ? '<span class="pill new">NEW</span>' : ''}${time ? `<span>${esc(time)}</span>` : ''}${x.place ? `<span>${esc(x.place)}</span>` : ''}${x.target ? `<span class="pill later">${esc(x.target)}</span>` : ''}${x.mine ? '<span class="pill mine">自分で登録</span>' : ''}</div>
          ${x.detail ? `<p>${nl2br(x.detail)}</p>` : ''}
          ${linksHtml(x.links)}</div>
        ${x.mine ? `<button class="del" type="button" data-del="${esc(x.id)}">削除</button>` : '<span></span>'}
      </article>`;
    }).join('') : '<div class="card"><p class="empty">予定はまだありません。</p></div>';

    const next = list[0];
    $('next-ev').innerHTML = next ? `${md(next.date)}<br><small>${esc(next.title)}</small>` : '<small>予定なし</small>';

    const allow = D.company.allowMyEvents;
    $('add-open').hidden = !allow;
    if (!allow) $('addform').hidden = true;
    $('f-title').innerHTML = (D.company.myEventOptions || []).map(o => `<option>${esc(o)}</option>`).join('');
  }

  $('add-open').addEventListener('click', () => {
    $('addform').hidden = false;
    if (!$('f-date').value) $('f-date').value = D.today;
    $('f-date').focus();
  });
  $('add-cancel').addEventListener('click', () => { $('addform').hidden = true; });
  $('addform').addEventListener('submit', async e => {
    e.preventDefault();
    const v = id => $(id).value;
    if (!v('f-date')) { toast('日付を入力してください'); return; }
    if (daysUntil(v('f-date')) < 0) { toast('今日以降の日付を選んでください'); return; }
    const btn = $('add-submit');
    btn.disabled = true;
    const ev = { date: v('f-date'), start: v('f-start'), end: v('f-end'), title: v('f-title'), memo: v('f-memo') };
    try {
      const res = await api(Object.assign({ action: 'addEvent', token: store.get().token }, ev));
      if (!res.ok) throw new Error(res.error);
      D.events.push({ id: res.id, date: ev.date, start: ev.start, end: ev.end, title: ev.title, detail: ev.memo, links: [], mine: true });
      D.events.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
      store.patch({ data: D });
      $('addform').hidden = true;
      $('f-memo').value = '';
      renderEvents();
      toast('予定を追加しました');
    } catch (ex) {
      toast('追加できませんでした。もう一度お試しください');
    } finally {
      btn.disabled = false;
    }
  });

  $('events').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = '削除する';
      setTimeout(() => { b.classList.remove('armed'); b.textContent = '削除'; }, 4000);
      return;
    }
    b.disabled = true;
    try {
      const res = await api({ action: 'deleteEvent', token: store.get().token, id: b.dataset.del });
      if (!res.ok) throw new Error(res.error);
      D.events = D.events.filter(x => x.id !== b.dataset.del);
      store.patch({ data: D });
      renderEvents();
      toast('予定を削除しました');
    } catch (ex) {
      b.disabled = false;
      toast('削除できませんでした。もう一度お試しください');
    }
  });

  /* お知らせ */
  const firstPara = s => String(s || '').split(/\r?\n/).find(x => x.trim()) || '';
  const isLong = n => String(n.body || '').length > 60 || /\n/.test(n.body || '') || (n.links && n.links.length);

  function newsCard(n) {
    return `<article class="card news${n.pinned ? ' pinned' : ''}">
      <div class="meta">${n.pinned ? `<span class="pinlabel">${ICON.pin}固定</span>` : ''}${n.isNew ? '<span class="pill new">NEW</span>' : ''}${n.date ? `<span>${md(n.date).replace(/（.）/, '')}</span>` : ''}</div>
      <h3>${esc(n.title)}</h3>
      ${n.body ? `<p class="clamp">${esc(firstPara(n.body))}</p>` : ''}
      ${isLong(n) ? `<button class="more-btn" type="button" data-news="${esc(n.id)}">詳細を見る →</button>` : ''}
    </article>`;
  }

  function renderNews() {
    const pinned = D.news.find(n => n.pinned);
    const rest = D.news.filter(n => !n.pinned);
    const count = D.company.newsCount || 3;
    const top = rest.slice(0, count);
    const more = rest.slice(count);
    $('news').innerHTML = (pinned ? newsCard(pinned) : '') + top.map(newsCard).join('') +
      (more.length ? `<details class="fold"><summary>過去のお知らせ（${more.length}件）</summary><div class="morelist">${more.map(newsCard).join('')}</div></details>` : '') ||
      '<div class="card"><p class="empty">お知らせはまだありません。</p></div>';
    $('dot-news').hidden = !D.news.some(n => n.isNew);
  }

  $('news').addEventListener('click', e => {
    const b = e.target.closest('[data-news]');
    if (!b) return;
    const n = D.news.find(x => x.id === b.dataset.news);
    if (n) openDetail(n.title, n.date ? md(n.date) : '', n.body, n.links, b, n.pinned, n.isNew);
  });

  /* 詳細ページ */
  let detailFrom = null;
  function openDetail(title, date, body, links, from, pinned, isNew) {
    detailFrom = from;
    $('dt-meta').innerHTML = `${pinned ? `<span class="pinlabel">${ICON.pin}固定</span>` : ''}${isNew ? '<span class="pill new">NEW</span>' : ''}${date ? `<span>${esc(date)}</span>` : ''}`;
    $('dt-title').textContent = title;
    $('dt-body').innerHTML = String(body || '').split(/\r?\n\s*\r?\n/).filter(x => x.trim()).map(p => `<p>${nl2br(p)}</p>`).join('');
    $('dt-links').innerHTML = linksHtml(links);
    $('detail').hidden = false;
    $('detail').scrollTop = 0;
    $('dt-back').focus();
  }
  function closeDetail() {
    $('detail').hidden = true;
    if (detailFrom) detailFrom.focus();
  }
  $('dt-back').addEventListener('click', closeDetail);

  /* リンク */
  const SNS = {
    '会社HP': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    '採用サイト': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
    'Instagram': '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><circle cx="17" cy="7" r=".6"/>',
    'X': '<path d="M5 4l14 16M19 4L5 20"/>',
    'YouTube': '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="m10 9 5 3-5 3z"/>',
    'TikTok': '<path d="M14 4v11a3 3 0 1 1-3-3M14 4c0 3 2 5 5 5"/>',
    'note': '<path d="M6 19V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v11"/>',
    'LinkedIn': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 10v6M8 7v.5M12 16v-6M12 13a2 2 0 0 1 4 0v3"/>',
    'Facebook': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M15 8h-2a2 2 0 0 0-2 2v10M9 13h6"/>',
    'その他': '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
  };
  function renderLinks() {
    $('sec-links').hidden = !D.links.length || !inTab('sec-links');
    $('sns').innerHTML = D.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span class="ic"><svg viewBox="0 0 24 24">${SNS[l.type] || SNS['その他']}</svg></span>${esc(l.type)}</a>`).join('');
  }

  /* ギャラリー */
  function renderGallery() {
    $('sec-gallery').hidden = !D.gallery.length || !inTab('sec-gallery');
    $('gallery').innerHTML = D.gallery.map((g, i) => `<button class="gitem" type="button" data-g="${i}"><img src="${esc(g.img)}" alt="${esc(g.caption)}" loading="lazy" referrerpolicy="no-referrer"><span class="gcap">${esc(g.caption)}</span></button>`).join('');
  }
  $('gallery').addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const g = D.gallery[Number(b.dataset.g)];
    $('lb-img').src = g.img;
    $('lb-img').alt = g.caption || '';
    $('lb-cap').textContent = g.caption || '';
    $('lb').hidden = false;
    $('lb-close').focus();
  });
  $('lb-close').addEventListener('click', () => { $('lb').hidden = true; });
  $('lb').addEventListener('click', e => { if (e.target === $('lb')) $('lb').hidden = true; });

  /* コンテンツ */
  function renderContents() {
    $('sec-contents').hidden = !D.contents.length || !inTab('sec-contents');
    $('contents').innerHTML = D.contents.map(x => {
      const thumb = x.thumb
        ? `<div class="thumb"><img src="${esc(x.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
        : `<div class="thumb">${x.type === '動画' ? '▶ 動画' : esc(x.type || '')}</div>`;
      const inner = `${thumb}<div style="min-width:0"><div class="meta">${x.isNew ? '<span class="pill new">NEW</span>' : ''}<span>${esc(x.type || '')}</span>${x.note ? `<span>${esc(x.note)}</span>` : ''}</div><h3>${esc(x.title)}</h3></div>`;
      if (x.type === '記事' && x.body) return `<button class="card ct" type="button" data-content="${esc(x.id)}">${inner}</button>`;
      if (x.url) return `<a class="card ct" href="${esc(x.url)}" target="_blank" rel="noopener">${inner}</a>`;
      return `<div class="card ct">${inner}</div>`;
    }).join('');
  }
  $('contents').addEventListener('click', e => {
    const b = e.target.closest('[data-content]');
    if (!b) return;
    const x = D.contents.find(c => c.id === b.dataset.content);
    if (x) openDetail(x.title, x.note || '', x.body, x.url ? [{ label: '関連リンク', url: x.url }] : [], b, false, x.isNew);
  });

  /* タブ */
  function inTab(sectionId) {
    const sec = $(sectionId);
    return sec.dataset.sec.split(' ').includes(currentTab);
  }
  function setTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.go === tab)));
    document.querySelectorAll('section[data-sec]').forEach(s => { s.hidden = !s.dataset.sec.split(' ').includes(tab); });
    // 中身が空のセクションは隠す
    if (D) {
      if (!D.links.length) $('sec-links').hidden = true;
      if (!D.gallery.length) $('sec-gallery').hidden = true;
      if (!D.contents.length) $('sec-contents').hidden = true;
    }
    $('summary').hidden = tab !== 'home';
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    setTab(b.dataset.go);
    window.scrollTo({ top: 0 });
  }));

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('lb').hidden) $('lb').hidden = true;
    else if (!$('detail').hidden) closeDetail();
  });

  // 他のアプリから戻ってきたときに最新を取りに行く（LINE から開き直した場合など）
  let lastLoad = Date.now();
  document.addEventListener('visibilitychange', () => {
    const s = store.get();
    if (document.visibilityState === 'visible' && D && s.token && Date.now() - lastLoad > 60000) {
      lastLoad = Date.now();
      load(s.token);
    }
  });

  boot();
})();
