/*
 * CXO 餐桌會：同仁的現場簽到／事後點名頁
 *
 * 同仁在同仁 LINE 群組輸入 #簽到 或 #點名 → 機器人回一張卡片 → 按「打開簽到頁」來到這一頁
 * 這一頁不需要登入 Google：呼叫機器人時一律「不帶 Google 登入」，所以手機、電腦登入幾個 Google 帳號都能開
 *
 * 資訊安全：
 *   - 只會呼叫下面 ALLOWED_APIS 列出的機器人網址，別人改網址也沒用
 *   - 網址裡只有場次和驗證碼（3 天內有效），沒有任何人的資料；機器人驗證通過才會回傳名單
 *   - 畫面一律用純文字顯示（不執行回傳內容裡的任何程式碼）
 *   - 不載入任何外部程式、追蹤碼
 *
 * 換部署（例如正式帳號上線）時，把新的網頁應用程式網址（結尾 /exec）加進 ALLOWED_APIS（和 ../app.js 一樣）。
 */
'use strict';

var ALLOWED_APIS = [
  // CXO 測試帳號
  'https://script.google.com/macros/s/AKfycbxfsSrleoOFSzMn84xPwOQN_40RgVFLblLZP2H1b_Kk86mWmm-bKMFHcxH8nrbr40G0/exec',
  // CXO 尊榮會員（正式帳號）：上線後把網址加在這一行下面
];

var $ = function (id) { return document.getElementById(id); };
var Q = null;        // 網址上的場次與驗證碼
var S = null;        // 機器人回傳的名單
var mode = '簽到';   // 簽到／點名
var busy = 0;        // 還在存檔中的點擊數（存檔中不自動更新，避免畫面跳回去）
var pending = {};    // id → 剛點的狀態（存好之前先顯示）

function readParams() {
  var p = new URLSearchParams(location.search);
  var q = { k: p.get('k') || '', e: p.get('e') || '', n: p.get('n') || '', t: p.get('t') || '', api: p.get('api') || '' };
  var ok = q.k.length > 0 && q.k.length < 200 && /^\d{10,16}$/.test(q.e) && /^[A-Za-z0-9]{6,20}$/.test(q.n) &&
    /^[A-Za-z0-9_-]{10,40}$/.test(q.t) && ALLOWED_APIS.indexOf(q.api) >= 0;
  mode = p.get('m') === '點名' ? '點名' : '簽到';
  return ok ? q : null;
}

function call(op, extra) {
  var url = Q.api + '?api=roll&op=' + op + '&k=' + encodeURIComponent(Q.k) + '&e=' + Q.e + '&n=' + Q.n + '&t=' + encodeURIComponent(Q.t);
  Object.keys(extra || {}).forEach(function (k) { url += '&' + k + '=' + encodeURIComponent(extra[k]); });
  return fetch(url, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'follow' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
}

function note(text, err) {
  var m = $('msg');
  m.hidden = !text;
  m.className = 'msg' + (err ? ' err' : '');
  m.textContent = text || '';
}

function fatal(text) {
  $('head').textContent = 'CXO 餐桌會簽到';
  $('tabs').hidden = true;
  $('foot').hidden = true;
  $('list').textContent = '';
  $('tip').textContent = '';
  $('bar').textContent = '';
  note(text, true);
}

function render() {
  if (!S) return;
  $('head').textContent = S.head || '';
  $('title').textContent = S.title || '';
  $('tabs').hidden = false;
  $('tabIn').className = mode === '簽到' ? 'on' : '';
  $('tabRoll').className = mode === '點名' ? 'on' : '';
  var people = S.people.map(function (p) {
    var v = pending[p.id] !== undefined ? pending[p.id] : p.v;
    return { id: p.id, no: p.no, name: p.name, v: v, wait: pending[p.id] !== undefined };
  });
  var c = { '到': 0, '未到': 0, '': 0 };
  people.forEach(function (p) { c[p.v] = (c[p.v] || 0) + 1; });
  $('bar').textContent = '共 ' + people.length + ' 位｜✅ 到 ' + c['到'] + '｜❌ 沒到 ' + c['未到'] + '｜還沒點 ' + c[''];
  $('tip').textContent = mode === '簽到'
    ? '有人到了就點他的名字（變綠色），點錯再點一次改回來。點了會自動存，群組不會跳訊息。'
    : '點「沒到」的人（變紅色），點錯再點一次改回出席。全部點完按最下面「確認完成」，其他還沒點的人就算出席。';
  var list = $('list');
  list.textContent = '';
  people.forEach(function (p) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'row' + (p.v === '到' ? ' yes' : p.v === '未到' ? ' no' : '') + (p.wait ? ' wait' : '');
    row.setAttribute('data-id', p.id);
    var no = document.createElement('span'); no.className = 'no'; no.textContent = String(p.no);
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
    var st = document.createElement('span'); st.className = 'st';
    st.textContent = p.v === '到' ? '✅ 到了' : p.v === '未到' ? '❌ 沒到' : (mode === '簽到' ? '還沒到' : '（算出席）');
    row.appendChild(no); row.appendChild(nm); row.appendChild(st);
    list.appendChild(row);
  });
  $('foot').hidden = mode !== '點名';
  $('time').textContent = (S.time || '') + ' 更新・每 15 秒自動更新';
}

function apply(r) {
  if (r && r.expired) { fatal(r.text || '連結已過期，請在群組重新輸入 #簽到 或 #點名'); return false; }
  if (r && r.people) S = r;
  render();
  return true;
}

function tap(id) {
  var p = S.people.filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  var cur = pending[id] !== undefined ? pending[id] : p.v;
  var next = mode === '簽到' ? (cur === '到' ? '' : '到') : (cur === '未到' ? '到' : '未到');
  pending[id] = next;
  busy++;
  note('');
  render();
  call('set', { id: id, v: next || '清除' }).then(function (r) {
    busy--;
    if (pending[id] === next) delete pending[id];
    if (r && !r.ok && !r.expired) note(r.text || '沒有存成功，請再點一次', true);
    apply(r);
  }).catch(function () {
    busy--;
    if (pending[id] === next) delete pending[id];
    note('網路不穩，剛剛那一下沒有存到，請再點一次', true);
    render();
  });
}

function poll() {
  if (busy || !Q) return;
  call('state').then(function (r) { if (!busy) apply(r); }).catch(function () { /* 下一次再試 */ });
}

function main() {
  Q = readParams();
  if (!Q) { fatal('這個連結已經過期或不完整。\n請在同仁群組重新輸入 #簽到 或 #點名。'); return; }
  $('list').addEventListener('click', function (ev) {
    var row = ev.target.closest('.row');
    if (row) tap(row.getAttribute('data-id'));
  });
  $('tabIn').addEventListener('click', function () { mode = '簽到'; note(''); render(); });
  $('tabRoll').addEventListener('click', function () { mode = '點名'; note(''); render(); });
  $('done').addEventListener('click', function () {
    if (!window.confirm('確定點名完成？還沒點的人都會算出席（之後還是可以改）')) return;
    var b = $('done');
    b.disabled = true;
    b.textContent = '送出中…';
    call('done').then(function (r) {
      b.disabled = false;
      b.textContent = '✔️ 確認完成（其他人算出席）';
      if (apply(r)) note(r.doneText || r.text || '', !r.doneText);
    }).catch(function () {
      b.disabled = false;
      b.textContent = '✔️ 確認完成（其他人算出席）';
      note('網路不穩，沒有送出，請再按一次', true);
    });
  });
  call('state').then(function (r) {
    if (!r || (!r.ok && !r.expired)) { fatal((r && r.text) || '讀不到名單，請在群組重新輸入 #簽到'); return; }
    apply(r);
    setInterval(poll, 15000);
  }).catch(function () {
    fatal('目前連不上，請稍後重新整理這一頁。');
  });
}

main();
