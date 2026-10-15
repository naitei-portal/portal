/**
 * テンプレートの作成。空のスプレッドシートで setupTemplate を1回実行する。
 * 既にあるシートは上書きしない。
 */

const COLOR_EDIT = '#2f6fb3';
const COLOR_AUTO = '#5f6b7d';
const MAX_ROWS = 500;

function setupTemplate() {
  const ss = ss_();
  const created = [];

  Object.values(SHEET).forEach(name => {
    if (ss.getSheetByName(name)) return;
    const sh = ss.insertSheet(name);
    created.push(name);
    if (HEADERS[name]) writeHeader_(sh, HEADERS[name], AUTO_SHEETS.includes(name));
    sh.setTabColor(AUTO_SHEETS.includes(name) ? COLOR_AUTO : COLOR_EDIT);
  });

  // 最初からある「シート1」などを消す
  ss.getSheets().forEach(sh => {
    if (!Object.values(SHEET).includes(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  if (created.includes(SHEET.SETTINGS)) setupSettings_();
  if (created.includes(SHEET.TEXTS)) setupTexts_();
  if (created.includes(SHEET.STUDENTS)) setupStudents_();
  if (created.includes(SHEET.EVENTS)) setupEvents_();
  if (created.includes(SHEET.TASKS)) setupTasks_();
  if (created.includes(SHEET.NEWS)) setupNews_();
  if (created.includes(SHEET.LINKS)) setupLinks_();
  if (created.includes(SHEET.GALLERY)) setupGallery_();
  if (created.includes(SHEET.CONTENTS)) setupContents_();
  if (created.includes(SHEET.LOG_MYEVENT)) sheet_(SHEET.LOG_MYEVENT).getRange(1, 1, 1, HEADERS[SHEET.LOG_MYEVENT].length).createFilter();

  AUTO_SHEETS.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      sh.protect().setDescription('自動で書き込まれるシートです').setWarningOnly(true);
    }
  });

  // 並び順を定義どおりに
  Object.values(SHEET).forEach((name, i) => {
    ss.setActiveSheet(ss.getSheetByName(name));
    ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(SHEET.SETTINGS));

  refreshProgress();

  SpreadsheetApp.getUi().alert(created.length
    ? `次のシートを作成しました。\n${created.join('、')}`
    : 'すべてのシートが既にあります。変更はありません。');
}

/* ---------- 見出し・入力規則の小道具 ---------- */

function writeHeader_(sh, headers, auto) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(auto ? COLOR_AUTO : COLOR_EDIT);
  sh.setFrozenRows(1);
}

function colRange_(sh, name) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, col_(headers, name), MAX_ROWS - 1, 1);
}

function list_(sh, name, items) {
  colRange_(sh, name).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(items, true).setAllowInvalid(false).build());
}

function checkbox_(sh, name) {
  colRange_(sh, name).insertCheckboxes();
}

function dateCol_(sh, name, pattern) {
  colRange_(sh, name).setNumberFormat(pattern || 'yyyy/mm/dd')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
}

function timeCol_(sh, name) {
  colRange_(sh, name).setNumberFormat('hh:mm');
}

function widths_(sh, map) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(map).forEach(k => sh.setColumnWidth(col_(headers, k), map[k]));
}

function wrap_(sh, names) {
  names.forEach(n => colRange_(sh, n).setWrap(true).setVerticalAlignment('top'));
}

function rows_(sh, rows) {
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------- 各シート ---------- */

function setupSettings_() {
  const sh = sheet_(SHEET.SETTINGS);
  rows_(sh, [
    ['会社名', '株式会社サンプル', '画面上部に表示されます'],
    ['ポータル名', '2027年度 内定者ポータル', ''],
    ['テンプレート', 'スタンダード', 'スタンダード／やわらか／きちんと'],
    ['テーマ色', '#2f6fb3', '色コード（例：#2f6fb3）'],
    ['トップ写真', '', 'Googleドライブの共有リンク。空欄ならテーマ色のグラデーション'],
    ['問い合わせ先の表示', '採用担当', 'ログイン画面などに表示されます'],
    ['ログイン保持日数', 30, 'この日数が過ぎるとパスワードの再入力が必要'],
    ['NEW表示', true, '前回ログイン以降に追加されたものにNEWを付ける'],
    ['お知らせの表示件数', 3, '固定のお知らせの下に表示する件数'],
    ['期限が近い表示（日）', 7, '期限の何日前からオレンジ表示にするか'],
    ['自分の予定の追加', true, '内定者が自分で予定を追加できるようにする'],
    ['自分の予定の選択肢', 'インターン出勤,アルバイト出勤,オンライン参加,その他', 'カンマ区切り'],
    ['会社コード', 'sample', '※管理項目　触らない※　運営側で設定します'],
    ['画面URL', 'https://naitei-portal.github.io/portal/', '※管理項目　触らない※　運営側で設定します'],
  ]);
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]);
  // 管理項目は編集しようとすると警告を出す
  sh.getRange(vals.indexOf('会社コード') + 2, 1, 2, 3).setBackground('#f1f3f4')
    .protect().setDescription('管理項目（運営側で設定）').setWarningOnly(true);
  ['NEW表示', '自分の予定の追加'].forEach(k => sh.getRange(vals.indexOf(k) + 2, 2).insertCheckboxes().check());
  sh.getRange(vals.indexOf('テンプレート') + 2, 2).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['スタンダード', 'やわらか', 'きちんと'], true).build());
  sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 420);
}

function setupTexts_() {
  const sh = sheet_(SHEET.TEXTS);
  rows_(sh, [
    ['挨拶', '', '{名前}さん、入社までよろしくお願いします'],
    ['見出し_やること', '', '今やること'],
    ['見出し_予定', '', 'これからの予定'],
    ['見出し_お知らせ', '', 'お知らせ'],
    ['見出し_リンク', '', '公式リンク'],
    ['見出し_ギャラリー', '', '職場の様子'],
    ['見出し_コンテンツ', '', '会社を知る'],
    ['メニュー_ホーム', '', 'ホーム'],
    ['メニュー_やること', '', 'やること'],
    ['メニュー_予定', '', '予定'],
    ['メニュー_お知らせ', '', 'お知らせ'],
    ['メニュー_会社を知る', '', '会社を知る'],
    ['ログイン説明', '', 'ご案内したパスワード'],
    ['やることがないとき', '', '今やることはありません。おつかれさまでした。'],
    ['ページ下の注意書き', '', 'このページはあなた専用です。URLとパスワードは他の人に共有しないでください。'],
    ['発行メッセージ', '', '{名前}さん\n内定者ポータルのご案内です。\n今後の予定や準備していただくことは、こちらに掲載します。\n\nURL：{URL}\nパスワード：{パスワード}'],
  ]);
  sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 360); sh.setColumnWidth(3, 420);
  sh.getRange(2, 2, MAX_ROWS - 1, 2).setWrap(true).setVerticalAlignment('top');
}

function setupStudents_() {
  const sh = sheet_(SHEET.STUDENTS);
  const h = HEADERS[SHEET.STUDENTS];
  list_(sh, '状態', ['未承諾', '承諾済', '辞退']);
  checkbox_(sh, '利用');
  dateCol_(sh, '前回ログイン', 'yyyy/mm/dd hh:mm');
  rows_(sh, [
    ['', '山田 花子', '山田 花子', '承諾済', '', true, '', '', 'サンプル'],
    ['', '佐藤 健', '佐藤 健', '未承諾', 'インターン中', true, '', '', 'サンプル'],
  ].map(r => r.concat(Array(h.length - r.length).fill(''))));
  assignIds_(sh, ID_PREFIX[SHEET.STUDENTS], 2, 3);
  const hideFrom = h.indexOf(STUDENT_HIDDEN_FROM) + 1;
  sh.hideColumns(hideFrom, h.length - hideFrom + 1);
  widths_(sh, { '氏名': 140, '表示名': 140, 'グループ': 140, '個別URL': 280, 'メモ': 240 });
}

function setupEvents_() {
  const sh = sheet_(SHEET.EVENTS);
  dateCol_(sh, '日付'); timeCol_(sh, '開始'); timeCol_(sh, '終了');
  checkbox_(sh, '公開'); dateCol_(sh, '公開開始日');
  dateCol_(sh, '登録日時', 'yyyy/mm/dd hh:mm');
  rows_(sh, [
    ['', new Date(2026, 9, 23), '14:00', '17:00', '内定者顔合わせ・社内見学', '本社 5F 会議室', '持ち物：筆記用具\n服装は自由です。終了後に懇親会があります（自由参加）。', '', '全員', true, '', ''],
    ['', new Date(2026, 10, 14), '19:00', '20:00', '先輩社員とのオンライン座談会', 'Google Meet', '参加URLは前日にこのページに掲載します。', '', '全員', true, '', ''],
    ['', new Date(2026, 11, 4), '13:00', '', '内定式', '本社 大会議室', '詳細は11月中にお知らせします。', '', '承諾済', true, '', ''],
  ]);
  assignIds_(sh, ID_PREFIX[SHEET.EVENTS], 2, 4);
  wrap_(sh, ['詳細', 'リンク']);
  widths_(sh, { 'タイトル': 220, '場所': 140, '詳細': 300, 'リンク': 220 });
}

function setupTasks_() {
  const sh = sheet_(SHEET.TASKS);
  dateCol_(sh, '期限');
  list_(sh, '完了の条件', ['対応したで完了', '確認したで完了']);
  checkbox_(sh, '公開'); dateCol_(sh, '公開開始日');
  dateCol_(sh, '登録日時', 'yyyy/mm/dd hh:mm');
  rows_(sh, [
    ['', '顔合わせの出欠回答', '出席できない場合は、理由をあわせてお知らせください。', new Date(2026, 9, 20), '出欠フォーム|https://example.com', '対応したで完了', '全員', true, '', ''],
    ['', '入社承諾書の提出', '署名・捺印のうえ、郵送または顔合わせ当日に手渡しでお願いします。', new Date(2026, 9, 31), '入社承諾書（PDF）|https://example.com\n記入例|https://example.com', '対応したで完了', '承諾済', true, '', ''],
    ['', '内定者アンケートへの回答', '約5分で終わります。', new Date(2026, 10, 7), 'アンケートに回答する|https://example.com', '対応したで完了', '全員', true, '', ''],
    ['', '内定者ハンドブックを読む', '入社までの流れをまとめています。', '', 'ハンドブック（PDF）|https://example.com', '確認したで完了', '全員', true, '', ''],
  ]);
  assignIds_(sh, ID_PREFIX[SHEET.TASKS], 2, 5);
  wrap_(sh, ['説明', 'リンク・添付']);
  widths_(sh, { 'タイトル': 220, '説明': 300, 'リンク・添付': 260, '完了の条件': 140 });
}

function setupNews_() {
  const sh = sheet_(SHEET.NEWS);
  dateCol_(sh, '掲載日');
  checkbox_(sh, '固定'); checkbox_(sh, '公開'); dateCol_(sh, '公開開始日');
  dateCol_(sh, '登録日時', 'yyyy/mm/dd hh:mm');
  rows_(sh, [
    ['', new Date(2026, 9, 1), '内定者のみなさんへ（はじめに読んでください）',
      '入社までの過ごし方や、このポータルの使い方をまとめました。\n\n■ 入社までの過ごし方\n残りの学生生活を大切にしてください。卒業に必要な単位の取得を最優先にお願いします。\n\n■ 困ったときは\n予定どおりに進められないときは、遠慮なく採用担当に相談してください。',
      '内定者ハンドブック（PDF）|https://example.com', true, '全員', true, '', ''],
    ['', new Date(2026, 9, 14), '顔合わせ当日の集合場所が変わりました', '1F受付ではなく、5F会議室に直接お越しください。', '', false, '全員', true, '', ''],
    ['', new Date(2026, 9, 1), '内定者ポータルを公開しました', '今後の予定や準備していただくことは、すべてこちらに掲載します。', '', false, '全員', true, '', ''],
  ]);
  assignIds_(sh, ID_PREFIX[SHEET.NEWS], 2, 4);
  wrap_(sh, ['本文', 'リンク・添付']);
  widths_(sh, { 'タイトル': 260, '本文': 400, 'リンク・添付': 240 });
}

function setupLinks_() {
  const sh = sheet_(SHEET.LINKS);
  rows_(sh, LINK_TYPES.map(t => [t, t === '会社HP' ? 'https://example.com' : '']));
  list_(sh, '種類', LINK_TYPES);
  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 400);
}

function setupGallery_() {
  const sh = sheet_(SHEET.GALLERY);
  checkbox_(sh, '公開');
  rows_(sh, [
    ['', 'オフィス入口', false],
    ['', '執務スペース', false],
    ['', '月1回の勉強会', false],
  ]);
  sh.setColumnWidth(1, 360); sh.setColumnWidth(2, 220);
}

function setupContents_() {
  const sh = sheet_(SHEET.CONTENTS);
  list_(sh, '種類', ['動画', '記事', '外部リンク']);
  checkbox_(sh, '公開'); dateCol_(sh, '公開開始日');
  dateCol_(sh, '登録日時', 'yyyy/mm/dd hh:mm');
  rows_(sh, [
    ['', '動画', '社長からのメッセージ', '3分', '', 'https://www.youtube.com/', '', '全員', false, '', ''],
    ['', '記事', '入社2年目の1日のスケジュール', '2024年入社', '', '', '9:00 出社、メールとチャットの確認から始めます。…', '全員', false, '', ''],
  ]);
  assignIds_(sh, ID_PREFIX[SHEET.CONTENTS], 2, 3);
  wrap_(sh, ['本文']);
  widths_(sh, { 'タイトル': 240, 'URL': 240, '本文': 360 });
}
