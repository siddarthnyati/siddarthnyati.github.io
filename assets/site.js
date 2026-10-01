/* Header rule on scroll, the journey tabs, and one run of the cover motion. */
(function () {
  'use strict';
  var header = document.querySelector('[data-header]');
  if (header) {
    var stick = function () { header.classList.toggle('is-stuck', window.scrollY > 8); };
    stick();
    window.addEventListener('scroll', stick, { passive: true });
  }

  var journey = document.querySelector('[data-journey]');
  if (journey) {
    var tabs = Array.prototype.slice.call(journey.querySelectorAll('[role="tab"]'));
    var select = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { journey.classList.add('is-open'); select(tab, false); });
      tab.addEventListener('keydown', function (ev) {
        var next = null;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (ev.key === 'Home') next = tabs[0];
        else if (ev.key === 'End') next = tabs[tabs.length - 1];
        if (next) { ev.preventDefault(); select(next, true); }
      });
    });
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var first = document.querySelectorAll('.group--lead .tile');
    Array.prototype.slice.call(first, 0, 3).forEach(function (tile, i) {
      setTimeout(function () {
        tile.classList.add('play');
        setTimeout(function () { tile.classList.remove('play'); }, 3200);
      }, 700 + i * 350);
    });
  }
})();
