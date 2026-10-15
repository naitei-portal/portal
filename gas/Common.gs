/**
 * 共通の小道具。
 */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error(`シート「${name}」が見つかりません。メニューの「初期セットアップ」を実行してください。`);
  return sh;
}

/**
 * 1行目を見出しとして、各行を {見出し: 値, _row: 行番号} の配列で返す。
 */
function readTable_(name) {
  const sh = sheet_(name);
  const range = sh.getDataRange();
  const values = range.getValues();
  const display = range.getDisplayValues();
  const headers = values.shift() || [];
  display.shift();
  const rows = values.map((v, i) => {
    // _d = 表示どおりの文字列（時刻セルを Date で読むとずれるため、時刻はこちらを使う）
    const o = { _row: i + 2, _d: {} };
    headers.forEach((h, j) => { o[h] = v[j]; o._d[h] = display[i][j]; });
    return o;
  });
  return { sheet: sh, headers, rows };
}

/** 見出しに無い列を右端に足す（後から列を増やしたときの移行用） */
function ensureColumns_(name, wanted) {
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const missing = wanted.filter(h => !headers.includes(h));
  if (!missing.length) return;
  const start = headers.length + 1;
  sh.getRange(1, start, 1, missing.length).setValues([missing])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#2f6fb3');
  if (name === SHEET.STUDENTS) sh.hideColumns(start, missing.length);
}

/** 列名から列番号（1始まり）を返す */
function col_(headers, name) {
  const i = headers.indexOf(name);
  if (i < 0) throw new Error(`列「${name}」が見つかりません`);
  return i + 1;
}

/** 設定シートを {項目: 値} で返す */
function settings_() {
  const o = {};
  readTable_(SHEET.SETTINGS).rows.forEach(r => { if (r['項目']) o[r['項目']] = r['値']; });
  return o;
}

/** 表示文言を {キー: 文言} で返す。空欄は既定の文言 */
function texts_() {
  const o = {};
  readTable_(SHEET.TEXTS).rows.forEach(r => {
    if (r['キー']) o[r['キー']] = r['文言'] !== '' ? r['文言'] : r['既定の文言'];
  });
  return o;
}

/**
 * 「対象」列の判定。空欄・全員 → 全員。
 * それ以外はカンマ（、も可）区切りで、状態・グループ・内定者IDのどれかに一致すれば対象。
 */
function matchesTarget_(target, student) {
  const t = String(target || '').trim();
  if (!t || t === '全員') return true;
  return t.split(/[,、，\s]+/).filter(Boolean).some(x =>
    x === student['状態'] || x === student['グループ'] || x === student['内定者ID']);
}

/** 公開中か（公開ON かつ 公開開始日が今日以前） */
function isPublished_(row, now) {
  if (row['公開'] !== true) return false;
  const start = row['公開開始日'];
  return !(start instanceof Date) || start.getTime() <= (now || new Date()).getTime();
}

function hex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function sha256_(text) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

/** 推測できないランダム文字列（UUID 2つ分の乱数から作る） */
function randomString_(length, charset) {
  const chars = charset || 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  while (out.length < length) {
    const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    for (let i = 0; i + 1 < hex.length && out.length < length; i += 2) {
      const n = parseInt(hex.substr(i, 2), 16);
      if (n < 256 - (256 % chars.length)) out += chars[n % chars.length]; // 偏りを避ける
    }
  }
  return out;
}

function fmtDate_(d, pattern) {
  if (!(d instanceof Date)) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), pattern || 'yyyy/MM/dd');
}

function log_(studentId, message) {
  sheet_(SHEET.LOG).appendRow([new Date(), studentId || '', message]);
}
