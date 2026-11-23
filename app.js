/*
 * CXO 餐桌會出席回覆：確認頁
 *
 * 會員點通知信裡的「會參加／無法參加」→ 打開這一頁 → 再按一次「確認」才會記錄。
 * 這一頁不需要登入，也不會碰到會員的 Google 帳號：呼叫機器人時一律「不帶 Google 登入」，
 * 所以電腦版瀏覽器登入幾個 Google 帳號都不影響。
 *
 * 資訊安全：
 *   - 只會呼叫下面 ALLOWED_APIS 列出的機器人網址，別人改網址也沒用
 *   - 機器人只回傳「這一場的主題、時間」和固定的回覆文字，沒有任何姓名、電話、Email 或其他人的資料
 *   - 畫面一律用純文字顯示（不執行回傳內容裡的任何程式碼）
 *   - 不載入任何外部程式、追蹤碼；點連結時不帶出這一頁的網址
 *
 * 換部署（例如正式帳號上線）時，把新的網頁應用程式網址（結尾 /exec，不含 ?key=…）加進 ALLOWED_APIS。
 */
'use strict';

var ALLOWED_APIS = [
  // CXO 測試帳號
  'https://script.google.com/macros/s/AKfycbxfsSrleoOFSzMn84xPwOQN_40RgVFLblLZP2H1b_Kk86mWmm-bKMFHcxH8nrbr40G0/exec',
  // CXO 尊榮會員（正式帳號）：上線後把網址加在這一行下面
];

var TEXT = {
  invalid: '這個連結已經失效，或資料不完整。',
  help: '請在 CXO 官方 LINE 留言，或直接回覆通知信，小管家會協助您 🙏',
  network: '目前連不上，請稍後再試一次，或在 CXO 官方 LINE 留言。',
  sending: '送出中…',
  retry: '再試一次',
};

var body = document.getElementById('body');

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* 把文字裡的 https 網址變成連結；其他一律當純文字 */
function linkified(text, cls) {
  var box = el('div', cls);
  String(text || '').split(/(https:\/\/[^\s]+)/).forEach(function (part) {
    if (/^https:\/\/[^\s]+$/.test(part)) {
      var a = el('a', null, part);
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.appendChild(a);
    } else if (part) {
      box.appendChild(document.createTextNode(part));
    }
  });
  return box;
}

function show(nodes) {
  body.textContent = '';
  nodes.forEach(function (n) { body.appendChild(n); });
}

function showInvalid() {
  show([el('p', null, TEXT.invalid), el('p', 'muted', TEXT.help)]);
}

/* 結果出來後，把網址列上的驗證碼拿掉，避免留在瀏覽紀錄或被截圖 */
function clearUrl() {
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* 不影響使用 */ }
}

function readParams() {
  var p = new URLSearchParams(location.search);
  var q = { a: p.get('a') || '', id: p.get('id') || '', v: p.get('v') || '', s: p.get('s') || '', t: p.get('t') || '', api: p.get('api') || '' };
  var ok = q.a === 'rsvp' && /^[A-Za-z0-9_-]{1,40}$/.test(q.id) && /^(yes|no)$/.test(q.v) &&
    /^[A-Za-z0-9_-]{0,20}$/.test(q.s) && /^[A-Za-z0-9_-]{10,40}$/.test(q.t) && ALLOWED_APIS.indexOf(q.api) >= 0;
  return ok ? q : null;
}

function call(q, api) {
  var url = q.api + '?api=' + api + '&a=rsvp&id=' + encodeURIComponent(q.id) + '&v=' + q.v +
    '&s=' + encodeURIComponent(q.s) + '&t=' + encodeURIComponent(q.t);
  return fetch(url, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'follow' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
}

function showConfirm(q, info) {
  var yes = info.v === 'yes';
  var btn = el('button', yes ? 'yes' : 'no', yes ? '✅ 確認會參加' : '確認無法參加');
  btn.type = 'button';
  var out = el('div');
  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = TEXT.sending;
    out.textContent = '';
    call(q, 'rsvp').then(function (r) {
      btn.remove();
      out.appendChild(linkified(r && r.text, 'msg' + (r && r.ok ? '' : ' warn')));
      clearUrl();
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = TEXT.retry;
      out.appendChild(el('p', 'muted', TEXT.network));
    });
  });
  show([
    el('p', 'title', info.title || '餐桌會'),
    el('p', 'muted date', info.dateStr || ''),
    el('p', 'prompt', yes ? '確認要回覆「會參加」這場餐桌會嗎？' : '確認要回覆「無法參加」這場餐桌會嗎？'),
    btn,
    out,
  ]);
}

function main() {
  var q = readParams();
  if (!q) { showInvalid(); return; }
  call(q, 'info').then(function (info) {
    if (!info || info.state !== 'confirm' || info.v !== q.v) { showInvalid(); clearUrl(); return; }
    showConfirm(q, info);
  }).catch(function () {
    var again = el('button', 'no', TEXT.retry);
    again.type = 'button';
    again.addEventListener('click', main);
    show([el('p', null, TEXT.network), again]);
  });
}

main();
