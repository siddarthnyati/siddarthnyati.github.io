/* The scripted agent: a dozen approved answers, no model behind it. */
(function () {
  'use strict';
  var node = document.getElementById('agent-data');
  var dlg = document.getElementById('agent');
  if (!node || !dlg) return;
  var data = JSON.parse(node.textContent);
  var log = dlg.querySelector('[data-agent-log]');
  var form = dlg.querySelector('[data-agent-form]');
  var input = dlg.querySelector('#agent-in');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SEAL = '<span class="seal"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><rect width="12" height="12" rx="2.5" fill="currentColor"/></svg>Approved by a person</span>';
  var timer = null;

  function scroll() { log.scrollTop = log.scrollHeight; }
  function say(text, who) {
    var m = document.createElement('div');
    m.className = 'msg msg--' + who;
    var p = document.createElement('p');
    m.appendChild(p);
    log.appendChild(m);
    if (who === 'you' || reduce) {
      p.textContent = text;
      if (who === 'agent') m.insertAdjacentHTML('beforeend', SEAL);
      scroll();
      return;
    }
    if (timer) clearInterval(timer);
    var i = 0;
    p.classList.add('typing');
    timer = setInterval(function () {
      i += 2;
      p.textContent = text.slice(0, i);
      scroll();
      if (i >= text.length) {
        clearInterval(timer); timer = null;
        p.classList.remove('typing');
        m.insertAdjacentHTML('beforeend', SEAL);
        scroll();
      }
    }, 16);
  }
  function answer(q) {
    say(q.q, 'you');
    setTimeout(function () { say(q.a, 'agent'); }, 300);
  }
  function match(text) {
    var t = text.toLowerCase(), best = null, score = 0;
    data.questions.forEach(function (q) {
      var s = q.keys.reduce(function (n, k) { return n + (t.indexOf(k) >= 0 ? 1 : 0); }, 0);
      if (s > score) { score = s; best = q; }
    });
    return best;
  }
  function open(idx) {
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    }
    if (idx == null) input.focus(); else answer(data.questions[idx]);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-open-agent]'), function (b) {
    b.addEventListener('click', function () { open(null); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-ask]'), function (b) {
    b.addEventListener('click', function () {
      var i = Number(b.getAttribute('data-ask'));
      if (b.closest('.agent')) answer(data.questions[i]); else open(i);
    });
  });
  dlg.querySelector('[data-close-agent]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = input.value.trim();
    if (!v) return;
    input.value = '';
    say(v, 'you');
    var m = match(v);
    setTimeout(function () { say(m ? m.a : data.fallback, 'agent'); }, 300);
  });
})();
