/**
 * 画面（GitHub Pages）から呼ばれる API。
 * ウェブアプリとして「実行ユーザー：自分」「アクセス：全員」で公開する。
 *
 * 画面からは POST（Content-Type: text/plain）で JSON を送る。
 *   { action: 'meta', k }                     → ログイン画面用の社名・色
 *   { action: 'login', k, password }          → { token, expires }
 *   { action: 'data', token }                 → ポータルに表示する本人向けデータ
 *   { action: 'check', token, taskId, state } → state: 0=未確認 1=確認済 2=対応済
 *   { action: 'addEvent', token, date, start, end, title, memo }
 *   { action: 'deleteEvent', token, id }
 */

const MAX_FAIL = 5;
const LOCK_MINUTES = 15;
const NEW_REFRESH_MINUTES = 60; // この時間以上空けて開いたら「前回」を更新する
// ファイルの読み込み順に左右されないよう、他ファイルの定数は使わず文字で書く
const STATE_LABEL = ['未確認', '確認済', '対応済'];

function doGet() {
  return json_({ ok: true, service: 'naitei-portal' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    switch (req.action) {
      case 'meta': return json_(meta_(req));
      case 'login': return json_(login_(req));
      case 'data': return json_(withStudent_(req, getData_));
      case 'check': return json_(withStudent_(req, check_));
      case 'addEvent': return json_(withStudent_(req, addEvent_));
      case 'deleteEvent': return json_(withStudent_(req, deleteEvent_));
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    log_('', `エラー：${req.action}：${err.message}`);
    return json_({ ok: false, error: 'server_error' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- ログイン ---------- */

/**
 * ログイン画面用の会社情報（社名・色・写真）。
 * 有効な個別キーを持つ人にだけ返す（URL を知らない人に社名を見せないため）。
 */
function meta_(req) {
  const s = readTable_(SHEET.STUDENTS).rows.find(r => r['アクセスキー'] && r['アクセスキー'] === String(req.k || ''));
  if (!s || s['利用'] !== true) return { ok: false, error: 'invalid' };
  const set = settings_();
  const texts = texts_();
  return {
    ok: true,
    company: {
      name: set['会社名'], portal: set['ポータル名'], template: set['テンプレート'], color: set['テーマ色'],
      hero: set['トップ写真'] ? imageUrl_(set['トップ写真']) : '', contact: set['問い合わせ先の表示'],
    },
    texts: { 'ログイン説明': texts['ログイン説明'] },
  };
}

function login_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureColumns_(SHEET.STUDENTS, HEADERS[SHEET.STUDENTS]);
    const { sheet, headers, rows } = readTable_(SHEET.STUDENTS);
    const s = rows.find(r => r['アクセスキー'] && r['アクセスキー'] === String(req.k || ''));
    if (!s || s['利用'] !== true || !s['パスワードハッシュ']) return { ok: false, error: 'invalid' };

    const now = new Date();
    const c = name => col_(headers, name);
    const until = s['ロック解除日時'];
    if (until instanceof Date && until > now) {
      return { ok: false, error: 'locked', minutes: Math.ceil((until - now) / 60000) };
    }

    if (sha256_(s['ソルト'] + String(req.password || '')) !== s['パスワードハッシュ']) {
      const fail = (Number(s['失敗回数']) || 0) + 1;
      if (fail >= MAX_FAIL) {
        sheet.getRange(s._row, c('失敗回数')).setValue(0);
        sheet.getRange(s._row, c('ロック解除日時')).setValue(new Date(now.getTime() + LOCK_MINUTES * 60000));
        log_(s['内定者ID'], `パスワードを${MAX_FAIL}回間違えたため${LOCK_MINUTES}分ロック`);
        return { ok: false, error: 'locked', minutes: LOCK_MINUTES };
      }
      sheet.getRange(s._row, c('失敗回数')).setValue(fail);
      log_(s['内定者ID'], `ログイン失敗（${fail}回目）`);
      return { ok: false, error: 'invalid', remaining: MAX_FAIL - fail };
    }

    sheet.getRange(s._row, c('失敗回数')).setValue(0);
    sheet.getRange(s._row, c('ロック解除日時')).setValue('');
    const days = Number(settings_()['ログイン保持日数']) || 30;
    const expires = now.getTime() + days * 864e5;
    return { ok: true, token: makeToken_(s['内定者ID'], s['ログイン世代'], expires), expires };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- トークン（端末に保存するログイン状態） ---------- */

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = randomString_(48);
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function sign_(text) {
  return hex_(Utilities.computeHmacSha256Signature(text, secret_()));
}

function makeToken_(studentId, generation, expires) {
  const body = `${studentId}.${Number(generation) || 0}.${expires}`;
  return `${body}.${sign_(body)}`;
}

/**
 * トークンを確かめて、本人の行を渡して fn を実行する。
 * 再発行（世代が変わる）・利用OFF・期限切れのトークンは使えない。
 */
function withStudent_(req, fn) {
  const parts = String(req.token || '').split('.');
  if (parts.length !== 4) return { ok: false, error: 'auth' };
  const [sid, gen, exp, sig] = parts;
  if (sign_(`${sid}.${gen}.${exp}`) !== sig || Number(exp) < Date.now()) return { ok: false, error: 'auth' };

  ensureColumns_(SHEET.STUDENTS, HEADERS[SHEET.STUDENTS]);
  const table = readTable_(SHEET.STUDENTS);
  const s = table.rows.find(r => r['内定者ID'] === sid);
  if (!s || s['利用'] !== true || String(Number(s['ログイン世代']) || 0) !== gen) return { ok: false, error: 'auth' };
  return fn(req, s, table);
}

/* ---------- 表示データ ---------- */

function getData_(req, s, table) {
  const now = new Date();
  const set = settings_();
  const texts = texts_();
  const newBase = touchLastLogin_(s, table, now, set['NEW表示'] === true);
  const isNew = row => !!newBase && row['登録日時'] instanceof Date && row['登録日時'] > newBase;
  const visible = row => isPublished_(row, now) && matchesTarget_(row['対象'], s);
  const today = startOfDay_(now);

  const events = readTable_(SHEET.EVENTS).rows
    .filter(r => r['予定ID'] && visible(r) && r['日付'] instanceof Date && r['日付'] >= today)
    .map(r => ({
      id: r['予定ID'], date: ymd_(r['日付']), start: r._d['開始'], end: r._d['終了'],
      title: r['タイトル'], place: r['場所'], detail: r['詳細'], links: parseLinks_(r['リンク']),
      target: r['対象'] && r['対象'] !== '全員' ? r['対象'] : '', isNew: isNew(r), mine: false,
    }))
    .concat(myEvents_(s['内定者ID']).filter(e => e._date >= today).map(e => {
      delete e._date; return e;
    }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const checks = checksOf_(s['内定者ID']);
  const tasks = readTable_(SHEET.TASKS).rows
    .filter(r => r['タスクID'] && visible(r))
    .map(r => {
      const c = checks[r['タスクID']] || {};
      return {
        id: r['タスクID'], title: r['タイトル'], desc: r['説明'],
        due: r['期限'] instanceof Date ? ymd_(r['期限']) : '',
        links: parseLinks_(r['リンク・添付']),
        confirmOnly: r['完了の条件'] === '確認したで完了',
        state: STATE_LABEL.indexOf(c.state) < 0 ? 0 : STATE_LABEL.indexOf(c.state),
        doneAt: c.state === STATUS.DONE ? ymd_(c.at) : '',
        isNew: isNew(r),
      };
    });

  const newsRows = readTable_(SHEET.NEWS).rows.filter(r => r['お知らせID'] && visible(r));
  const pinned = newsRows.filter(r => r['固定'] === true)
    .sort((a, b) => (b['掲載日'] || 0) - (a['掲載日'] || 0))[0];
  const news = newsRows
    .sort((a, b) => (b['掲載日'] || 0) - (a['掲載日'] || 0))
    .map(r => ({
      id: r['お知らせID'], date: r['掲載日'] instanceof Date ? ymd_(r['掲載日']) : '',
      title: r['タイトル'], body: r['本文'], links: parseLinks_(r['リンク・添付']),
      pinned: r === pinned, isNew: isNew(r),
    }));

  const links = readTable_(SHEET.LINKS).rows
    .filter(r => r['種類'] && r['URL'])
    .map(r => ({ type: r['種類'], url: r['URL'] }));

  const gallery = readTable_(SHEET.GALLERY).rows
    .filter(r => r['画像'] && r['公開'] === true)
    .slice(0, 10)
    .map(r => ({ img: imageUrl_(r['画像']), caption: r['キャプション'] }));

  const contents = readTable_(SHEET.CONTENTS).rows
    .filter(r => r['コンテンツID'] && visible(r))
    .map(r => ({
      id: r['コンテンツID'], type: r['種類'], title: r['タイトル'], note: r['補足'],
      thumb: r['サムネイル'] ? imageUrl_(r['サムネイル']) : youtubeThumb_(r['URL']),
      url: r['URL'], body: r['本文'], isNew: isNew(r),
    }));

  return {
    ok: true,
    company: {
      name: set['会社名'], portal: set['ポータル名'], template: set['テンプレート'],
      color: set['テーマ色'], hero: set['トップ写真'] ? imageUrl_(set['トップ写真']) : '',
      contact: set['問い合わせ先の表示'], newsCount: Number(set['お知らせの表示件数']) || 3,
      dueSoonDays: Number(set['期限が近い表示（日）']) || 7,
      allowMyEvents: set['自分の予定の追加'] === true,
      myEventOptions: String(set['自分の予定の選択肢'] || '').split(/[,、]/).map(x => x.trim()).filter(Boolean),
    },
    texts,
    me: { id: s['内定者ID'], name: s['表示名'] || s['氏名'] },
    today: ymd_(now),
    events, tasks, news, links, gallery, contents,
  };
}

/**
 * 前回ログインを更新し、NEW の基準日時を返す。
 * 初回は NEW を付けない（すべてが新しいため）。
 * 短時間に開き直しても NEW が消えないよう、NEW_REFRESH_MINUTES 以上空いたときだけ基準を進める。
 */
function touchLastLogin_(s, table, now, showNew) {
  const sh = table.sheet;
  const c = name => col_(table.headers, name);
  const last = s['前回ログイン'];
  let base = s['NEW基準日時'] instanceof Date ? s['NEW基準日時'] : null;

  if (!(last instanceof Date)) {
    base = now;
    sh.getRange(s._row, c('NEW基準日時')).setValue(now);
  } else if (now - last >= NEW_REFRESH_MINUTES * 60000) {
    base = last;
    sh.getRange(s._row, c('NEW基準日時')).setValue(last);
  }
  sh.getRange(s._row, c('前回ログイン')).setValue(now);
  return showNew ? base : null;
}

/* ---------- 書き込み ---------- */

function check_(req, s) {
  const state = Number(req.state);
  const tasks = readTable_(SHEET.TASKS).rows;
  const t = tasks.find(r => r['タスクID'] === req.taskId);
  if (!t || !isPublished_(t) || !matchesTarget_(t['対象'], s) || !(state >= 0 && state <= 2)) {
    return { ok: false, error: 'bad_request' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_(SHEET.LOG_CHECK).appendRow([new Date(), s['内定者ID'], s['氏名'], t['タスクID'], t['タイトル'], STATE_LABEL[state]]);
    refreshProgress();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, state, doneAt: state === 2 ? ymd_(new Date()) : '' };
}

function addEvent_(req, s) {
  if (settings_()['自分の予定の追加'] !== true) return { ok: false, error: 'disabled' };
  const date = parseYmd_(req.date);
  const time = v => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : '';
  const title = String(req.title || '').slice(0, 40);
  if (!date || !title) return { ok: false, error: 'bad_request' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getDocumentProperties();
    const n = (Number(props.getProperty('seq_M')) || 0) + 1;
    props.setProperty('seq_M', String(n));
    const id = 'M' + ('00' + n).slice(-3);
    // 時刻は文字列のまま保存（' を付けて時刻に変換されないようにする）
    sheet_(SHEET.LOG_MYEVENT).appendRow([id, s['内定者ID'], s['氏名'], date,
      "'" + time(req.start), "'" + time(req.end), title, String(req.memo || '').slice(0, 100), new Date(), false]);
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

function deleteEvent_(req, s) {
  const { sheet, headers, rows } = readTable_(SHEET.LOG_MYEVENT);
  const r = rows.find(x => x['予定ID'] === req.id && x['内定者ID'] === s['内定者ID']);
  if (!r) return { ok: false, error: 'not_found' };
  sheet.getRange(r._row, col_(headers, '削除済')).setValue(true);
  return { ok: true };
}

/* ---------- 読み出しの小道具 ---------- */

function myEvents_(studentId) {
  return readTable_(SHEET.LOG_MYEVENT).rows
    .filter(r => r['内定者ID'] === studentId && r['削除済'] !== true && r['日付'] instanceof Date)
    .map(r => ({
      id: r['予定ID'], date: ymd_(r['日付']), start: r._d['開始'], end: r._d['終了'],
      title: r['内容'], detail: r['メモ'], links: [], mine: true, _date: r['日付'],
    }));
}

/** {タスクID: {state, at}}（記録_チェックの最新） */
function checksOf_(studentId) {
  const out = {};
  readTable_(SHEET.LOG_CHECK).rows.forEach(r => {
    if (r['内定者ID'] === studentId) out[r['タスクID']] = { state: r['状態'], at: r['日時'] };
  });
  return out;
}

/** 「表示名|URL」を1行1つ。PDF やドライブのファイルは添付扱い */
function parseLinks_(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const i = line.lastIndexOf('|');
    const label = i > 0 ? line.slice(0, i).trim() : line;
    const url = i > 0 ? line.slice(i + 1).trim() : line;
    const file = /\.pdf($|\?)|drive\.google\.com\/file|docs\.google\.com\/(document|spreadsheets|presentation)/i.test(url)
      || /PDF|添付|資料/i.test(label);
    return { label, url, file };
  }).filter(l => /^https?:\/\//.test(l.url));
}

/** Google ドライブの共有リンクを、画面で表示できる画像URLに変える */
function imageUrl_(url) {
  const m = String(url).match(/(?:\/d\/|[?&]id=)([\w-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600` : String(url);
}

function youtubeThumb_(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : '';
}

function ymd_(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}

function parseYmd_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
