/**
 * シート名・列の定義。列の並びはここを正とする。
 */
const SHEET = {
  SETTINGS: '設定',
  TEXTS: '表示文言',
  STUDENTS: '内定者',
  EVENTS: '予定',
  TASKS: 'やること',
  NEWS: 'お知らせ',
  LINKS: 'リンク',
  GALLERY: 'ギャラリー',
  CONTENTS: 'コンテンツ',
  LOG_CHECK: '記録_チェック',
  LOG_MYEVENT: '記録_自分の予定',
  PROGRESS: '進捗一覧',
  LOG: 'ログ',
};

const HEADERS = {
  [SHEET.SETTINGS]: ['項目', '値', '説明'],
  [SHEET.TEXTS]: ['キー', '文言', '既定の文言'],
  [SHEET.STUDENTS]: ['内定者ID', '氏名', '表示名', '状態', 'グループ', '利用', '個別URL', '前回ログイン', 'メモ',
    // ここから下は非表示列（GASが管理）
    'アクセスキー', 'パスワードハッシュ', 'ソルト', 'ログイン世代', '失敗回数', 'ロック解除日時', '発行日時', 'NEW基準日時'],
  [SHEET.EVENTS]: ['予定ID', '日付', '開始', '終了', 'タイトル', '場所', '詳細', 'リンク', '対象', '公開', '公開開始日', '登録日時'],
  [SHEET.TASKS]: ['タスクID', 'タイトル', '説明', '期限', 'リンク・添付', '完了の条件', '対象', '公開', '公開開始日', '登録日時'],
  [SHEET.NEWS]: ['お知らせID', '掲載日', 'タイトル', '本文', 'リンク・添付', '固定', '対象', '公開', '公開開始日', '登録日時'],
  [SHEET.LINKS]: ['種類', 'URL'],
  [SHEET.GALLERY]: ['画像', 'キャプション', '公開'],
  [SHEET.CONTENTS]: ['コンテンツID', '種類', 'タイトル', '補足', 'サムネイル', 'URL', '本文', '対象', '公開', '公開開始日', '登録日時'],
  [SHEET.LOG_CHECK]: ['日時', '内定者ID', '氏名', 'タスクID', 'タイトル', '状態'],
  [SHEET.LOG_MYEVENT]: ['予定ID', '内定者ID', '氏名', '日付', '開始', '終了', '内容', 'メモ', '登録日時', '削除済'],
  [SHEET.LOG]: ['日時', '内定者ID', '内容'],
};

/** 内定者シートで非表示にする最初の列名 */
const STUDENT_HIDDEN_FROM = 'アクセスキー';

/** 自動採番するシートと接頭辞 */
const ID_PREFIX = {
  [SHEET.STUDENTS]: 'S',
  [SHEET.EVENTS]: 'E',
  [SHEET.TASKS]: 'T',
  [SHEET.NEWS]: 'N',
  [SHEET.CONTENTS]: 'C',
};

/** 担当者が編集するシート（見出しの色を分ける） */
const EDITABLE_SHEETS = [SHEET.SETTINGS, SHEET.TEXTS, SHEET.STUDENTS, SHEET.EVENTS, SHEET.TASKS,
  SHEET.NEWS, SHEET.LINKS, SHEET.GALLERY, SHEET.CONTENTS];

/** 自動で書かれるシート */
const AUTO_SHEETS = [SHEET.LOG_CHECK, SHEET.LOG_MYEVENT, SHEET.PROGRESS, SHEET.LOG];

const STATUS = { UNSEEN: '未確認', SEEN: '確認済', DONE: '対応済', NA: '対象外' };

const LINK_TYPES = ['会社HP', '採用サイト', 'Instagram', 'X', 'YouTube', 'TikTok', 'note', 'LinkedIn', 'Facebook', 'その他'];
