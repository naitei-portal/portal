/**
 * 担当者向けのメニューと処理。
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('内定者ポータル')
    .addItem('URL・パスワードを発行（選択した内定者）', 'issueCredentials')
    .addItem('進捗一覧を更新', 'refreshProgress')
    .addSeparator()
    .addItem('初期セットアップ（シートを作成）', 'setupTemplate')
    .addToUi();
}

/** 行を追加したら ID と登録日時を自動で入れる（シンプルトリガー） */
function onEdit(e) {
  const sh = e.range.getSheet();
  const prefix = ID_PREFIX[sh.getName()];
  if (!prefix) return;
  const from = Math.max(2, e.range.getRow());
  const to = e.range.getRow() + e.range.getNumRows() - 1;
  if (to >= from) assignIds_(sh, prefix, from, to);
}

/**
 * from〜to 行のうち、ID が空で他の列に入力がある行に ID を振る。
 * 「登録日時」列があれば同時に記録する（NEW 表示の判定に使う）。
 * 入力が全部消された行は ID と登録日時も消す。
 * 番号は一度使ったら再利用しない（消した ID の記録が別の行に紐づかないように）。
 */
function assignIds_(sh, prefix, from, to) {
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const regCol = headers.indexOf('登録日時') + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const props = PropertiesService.getDocumentProperties();
  const seqKey = 'seq_' + prefix;
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
  let max = ids.reduce((m, id) => {
    const n = id.startsWith(prefix) ? parseInt(id.slice(prefix.length), 10) : 0;
    return isNaN(n) ? m : Math.max(m, n);
  }, Number(props.getProperty(seqKey)) || 0);
  const start = max;

  const end = Math.min(to, lastRow);
  if (end < from) return;
  const block = sh.getRange(from, 1, end - from + 1, lastCol).getValues();
  block.forEach((row, i) => {
    // ID・登録日時・チェックボックス以外に何か入っていれば「行がある」とみなす
    const filled = row.some((v, j) => j > 0 && j !== regCol - 1 && v !== '' && v !== false && v !== true);
    if (row[0] && !filled) {
      sh.getRange(from + i, 1).clearContent();
      if (regCol) sh.getRange(from + i, regCol).clearContent();
      return;
    }
    if (row[0] || !filled) return;
    max += 1;
    sh.getRange(from + i, 1).setValue(prefix + ('00' + max).slice(-3));
    if (regCol) sh.getRange(from + i, regCol).setValue(new Date());
  });
  if (max !== start || !props.getProperty(seqKey)) props.setProperty(seqKey, String(max));
}

/* ---------- URL・パスワードの発行 ---------- */

function issueCredentials() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET.STUDENTS) {
    ui.alert('「内定者」シートで、発行したい人の行を選択してから実行してください。');
    return;
  }
  const s = settings_();
  if (!s['画面URL'] || !s['会社コード']) {
    ui.alert('「設定」シートの「画面URL」と「会社コード」を入力してください。');
    return;
  }

  const rowNums = selectedRows_(sh).filter(r => r >= 2);
  const { headers, rows } = readTable_(SHEET.STUDENTS);
  const targets = rows.filter(r => rowNums.includes(r._row) && r['氏名']);
  if (!targets.length) { ui.alert('氏名が入力されている行を選択してください。'); return; }

  const reissue = targets.filter(r => r['パスワードハッシュ']).map(r => r['氏名']);
  if (reissue.length) {
    const ok = ui.alert('パスワードの再発行',
      `次の人は発行済みです。新しいパスワードを発行すると、前のパスワードと保存済みのログインは使えなくなります。\n\n${reissue.join('、')}\n\n続けますか？`,
      ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
  }

  const texts = texts_();
  const base = String(s['画面URL']).replace(/\/?$/, '/');
  const messages = [];
  const c = name => col_(headers, name);

  targets.forEach(r => {
    if (!r['内定者ID']) assignIds_(sh, ID_PREFIX[SHEET.STUDENTS], r._row, r._row);
    const key = r['アクセスキー'] || randomString_(32, 'abcdefghijklmnopqrstuvwxyz0123456789');
    const password = randomString_(8);
    const salt = randomString_(16);
    const url = `${base}?c=${encodeURIComponent(s['会社コード'])}&k=${key}`;

    sh.getRange(r._row, c('アクセスキー')).setValue(key);
    sh.getRange(r._row, c('パスワードハッシュ')).setValue(sha256_(salt + password));
    sh.getRange(r._row, c('ソルト')).setValue(salt);
    sh.getRange(r._row, c('ログイン世代')).setValue((Number(r['ログイン世代']) || 0) + 1);
    sh.getRange(r._row, c('失敗回数')).setValue(0);
    sh.getRange(r._row, c('ロック解除日時')).setValue('');
    sh.getRange(r._row, c('発行日時')).setValue(new Date());
    sh.getRange(r._row, c('個別URL')).setValue(url);
    if (r['利用'] !== true) sh.getRange(r._row, c('利用')).setValue(true);

    messages.push({
      name: r['氏名'],
      text: String(texts['発行メッセージ'])
        .replace(/\{名前\}/g, r['表示名'] || r['氏名'])
        .replace(/\{URL\}/g, url)
        .replace(/\{パスワード\}/g, password),
    });
  });

  showMessages_(messages);
}

function selectedRows_(sh) {
  const out = [];
  sh.getActiveRangeList().getRanges().forEach(rg => {
    for (let i = 0; i < rg.getNumRows(); i++) out.push(rg.getRow() + i);
  });
  return out;
}

function showMessages_(messages) {
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const blocks = messages.map((m, i) => `
    <section>
      <h3>${esc(m.name)}さん</h3>
      <textarea id="m${i}" readonly>${esc(m.text)}</textarea>
      <button onclick="copy('m${i}', this)">コピー</button>
    </section>`).join('');
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:sans-serif;font-size:13px;color:#1d2430}
      p{color:#c2410c;font-weight:bold}
      section{margin-bottom:16px}
      h3{font-size:14px;margin:0 0 4px}
      textarea{width:100%;height:120px;font:inherit;box-sizing:border-box}
      button{margin-top:4px;padding:4px 12px}
    </style>
    <p>パスワードはこの画面でしか確認できません。閉じる前にコピーして、LINEで送ってください。</p>
    ${blocks}
    <script>
      function copy(id, btn){ const t=document.getElementById(id); t.select();
        navigator.clipboard.writeText(t.value).then(()=>btn.textContent='コピーしました', ()=>{document.execCommand('copy');btn.textContent='コピーしました'}); }
    </script>`).setWidth(520).setHeight(Math.min(640, 160 + messages.length * 190));
  SpreadsheetApp.getUi().showModalDialog(html, 'LINEで送る案内文');
}

/* ---------- 進捗一覧 ---------- */

// ファイルの読み込み順に左右されないよう、他ファイルの定数は使わず文字で書く
const PROGRESS_COLOR = {
  '未確認': '#fde2e1',
  '確認済': '#fff4c2',
  '対応済': '#d9f2e3',
  '対象外': '#f1f3f4',
};

/** 記録_チェックの最新状態から、内定者×やることの表を作り直す */
function refreshProgress() {
  const sh = sheet_(SHEET.PROGRESS);
  const now = new Date();
  const students = readTable_(SHEET.STUDENTS).rows.filter(r => r['内定者ID'] && r['状態'] !== '辞退');
  const tasks = readTable_(SHEET.TASKS).rows
    .filter(r => r['タスクID'] && isPublished_(r, now))
    .sort((a, b) => (a['期限'] || 8.64e15) - (b['期限'] || 8.64e15));
  const latest = latestChecks_();

  const header = ['内定者', '状態', '前回ログイン', '完了'].concat(
    tasks.map(t => t['期限'] instanceof Date ? `${t['タイトル']}（${fmtDate_(t['期限'], 'M/d')}）` : t['タイトル']));

  const values = [], colors = [], weights = [];
  students.forEach(s => {
    let done = 0, total = 0;
    const cells = tasks.map(t => {
      if (!matchesTarget_(t['対象'], s)) return STATUS.NA;
      total += 1;
      const st = latest[`${s['内定者ID']}|${t['タスクID']}`] || STATUS.UNSEEN;
      if (st === STATUS.DONE) done += 1;
      return st;
    });
    values.push([s['氏名'], s['状態'], s['前回ログイン'] || '未ログイン', `${done} / ${total}`].concat(cells));
    colors.push([null, null, s['前回ログイン'] ? null : PROGRESS_COLOR[STATUS.UNSEEN], null].concat(cells.map(c => PROGRESS_COLOR[c])));
    weights.push(['normal', 'normal', 'normal', 'normal'].concat(cells.map((c, i) => {
      const due = tasks[i]['期限'];
      return (c === STATUS.UNSEEN || c === STATUS.SEEN) && due instanceof Date && due < now ? 'bold' : 'normal';
    })));
  });

  sh.clear();
  sh.getRange(1, 1).setValue(`最終更新：${fmtDate_(now, 'yyyy/MM/dd HH:mm')}　赤＝未確認　黄＝確認済　緑＝対応済　太字＝期限切れ`)
    .setFontColor(COLOR_AUTO);
  sh.getRange(2, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(COLOR_AUTO).setWrap(true).setVerticalAlignment('middle');
  if (values.length) {
    const body = sh.getRange(3, 1, values.length, header.length);
    body.setValues(values).setBackgrounds(colors).setFontWeights(weights);
    sh.getRange(3, 3, values.length, 1).setNumberFormat('m/d hh:mm');
    sh.getRange(3, 4, values.length, header.length - 3).setHorizontalAlignment('center');
  }
  sh.setFrozenRows(2);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 140);
  if (tasks.length) sh.setColumnWidths(5, tasks.length, 140);
}

/** {内定者ID|タスクID: 最新の状態} */
function latestChecks_() {
  const out = {};
  readTable_(SHEET.LOG_CHECK).rows.forEach(r => {
    if (r['内定者ID'] && r['タスクID']) out[`${r['内定者ID']}|${r['タスクID']}`] = r['状態'];
  });
  return out;
}
