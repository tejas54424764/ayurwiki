// Ayurwiki — X-inspired card feed for category landing pages.
// Transforms the server-rendered A–Z list on /herbs/, /medicines/, etc.
// into a paginated grid of summary cards with an alphabet filter.
(function () {
  'use strict';

  var FEEDS = [
    'herbs', 'medicines', 'yoga', 'concepts',
    'physiology', 'practices', 'traditions', 'manufacturers',
    'all-articles'
  ];
  var PER_PAGE = 24;

  // ---- helpers -----------------------------------------------------------

  function segments(pathname) {
    var segs = pathname.split('/').filter(function (s) { return s.length; });
    if (segs.length && segs[segs.length - 1].indexOf('.') !== -1) segs.pop(); // drop index.html
    return segs;
  }

  // Returns {cat, base, root} if this is a feed landing page, else null.
  function detectCategory() {
    var segs = segments(location.pathname);
    if (!segs.length) return null;
    var last = segs[segs.length - 1];
    if (FEEDS.indexOf(last) === -1) return null;
    var basePath = '/' + segs.slice(0, segs.length - 1).join('/');
    if (basePath.length > 1) basePath += '/';
    // all-articles pages live at the docs root, not under a category dir.
    return { cat: last, base: basePath, root: last === 'all-articles' };
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- main --------------------------------------------------------------

  function init() {
    var ctx = detectCategory();
    if (!ctx) return;

    var inner = document.querySelector('.md-content__inner.md-typeset')
             || document.querySelector('.md-content .md-typeset');
    if (!inner || inner.querySelector('.aw-feed')) return; // already built

    var jsonUrl = ctx.base + 'assets/cards/' + ctx.cat + '.json';
    fetch(jsonUrl)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (cards) { build(inner, ctx, cards); })
      .catch(function () { /* leave the plain list in place on failure */ });
  }

  function build(inner, ctx, cards) {
    // Replace the server-rendered list (section headings + A–Z letter lists)
    // with one unified card feed, keeping the H1, intro and "N articles" line.
    // Sub-collections (Proprietary, Mudras, …) are folded into the same feed.
    Array.prototype.slice.call(inner.children).forEach(function (n) {
      var t = n.tagName;
      if (t === 'H2' || t === 'H3' || t === 'UL' || t === 'HR') {
        n.style.display = 'none';
      }
    });

    // Back-to-home link above the heading
    if (!inner.querySelector('.aw-back')) {
      var back = el('a', 'aw-back', '&larr; Home');
      back.href = ctx.base || '/';
      inner.insertBefore(back, inner.firstChild);
    }

    var state = { letter: '', page: 1, query: '' };

    // Feed container
    var feed = el('section', 'aw-feed');
    var grid = el('div', 'aw-card-grid');
    var pager = el('nav', 'aw-pager');
    var count = el('div', 'aw-feed-count');

    // Search box
    var label = ctx.root ? 'all pages' : ctx.cat;
    var search = el('div', 'aw-feed-search');
    var input = el('input', 'aw-feed-input');
    input.type = 'search';
    input.placeholder = 'Search ' + label + '…';
    input.setAttribute('aria-label', 'Search ' + label);
    search.appendChild(input);
    feed.appendChild(search);
    feed.appendChild(count);
    feed.appendChild(grid);
    feed.appendChild(pager);
    inner.appendChild(feed);

    input.addEventListener('input', function () {
      state.query = input.value;
      state.page = 1;
      render();
    });

    // Alphabet filter — build the letter set actually present
    var present = {};
    cards.forEach(function (c) { present[c.l || '#'] = true; });
    var ALPHA = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    function filtered() {
      var q = state.query.trim().toLowerCase();
      return cards.filter(function (c) {
        if (state.letter && (c.l || '#') !== state.letter) return false;
        if (q && (c.t || '').toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
    }

    function cardHref(slug) {
      if (ctx.root) return ctx.base + encodeURI(slug) + '/';
      return ctx.base + ctx.cat + '/' + encodeURI(slug) + '/';
    }
    function imgSrc(fn) {
      return 'https://img.ayurwiki.org/' + encodeURI(fn);
    }

    function render() {
      var list = filtered();
      var total = list.length;
      var pages = Math.max(1, Math.ceil(total / PER_PAGE));
      if (state.page > pages) state.page = pages;
      var start = (state.page - 1) * PER_PAGE;
      var slice = list.slice(start, start + PER_PAGE);

      grid.innerHTML = '';
      slice.forEach(function (c) {
        var a = el('a', 'aw-card');
        a.href = cardHref(c.s);
        var thumb;
        if (c.i) {
          thumb = el('div', 'aw-card-thumb');
          var img = el('img');
          img.loading = 'lazy';
          img.alt = '';
          img.src = imgSrc(c.i);
          img.onerror = function () {
            thumb.classList.add('aw-card-thumb--empty');
            img.remove();
          };
          thumb.appendChild(img);
        } else {
          thumb = el('div', 'aw-card-thumb aw-card-thumb--empty');
        }
        a.appendChild(thumb);
        var body = el('div', 'aw-card-body');
        body.appendChild(el('div', 'aw-card-title', esc(c.t)));
        if (c.d) body.appendChild(el('div', 'aw-card-desc', esc(c.d)));
        a.appendChild(body);
        grid.appendChild(a);
      });

      if (total === 0) {
        grid.appendChild(el('div', 'aw-feed-empty',
          'No matches' + (state.query ? ' for “' + esc(state.query.trim()) + '”' : '') + '.'));
      }

      var parts = [];
      if (state.letter) parts.push('“' + state.letter + '”');
      if (state.query.trim()) parts.push('“' + state.query.trim() + '”');
      var prefix = parts.length ? parts.join(' · ') + ' · ' : '';
      var showFrom = total ? start + 1 : 0;
      var showTo = Math.min(start + PER_PAGE, total);
      count.textContent = prefix + 'Showing ' + showFrom + '–' + showTo + ' of ' + total;

      renderPager(pages);
      renderAlpha();
    }

    function renderPager(pages) {
      pager.innerHTML = '';
      if (pages <= 1) return;
      var cur = state.page;
      function btn(label, page, opts) {
        opts = opts || {};
        var b = el('button', 'aw-pg-btn' + (opts.active ? ' aw-pg-active' : '') + (opts.disabled ? ' aw-pg-disabled' : ''), label);
        if (!opts.disabled && !opts.active) {
          b.addEventListener('click', function () { go(page); });
        }
        return b;
      }
      pager.appendChild(btn('‹ Prev', cur - 1, { disabled: cur === 1 }));
      var seq = pageSeq(cur, pages);
      seq.forEach(function (p) {
        if (p === '…') pager.appendChild(el('span', 'aw-pg-gap', '…'));
        else pager.appendChild(btn(String(p), p, { active: p === cur }));
      });
      pager.appendChild(btn('Next ›', cur + 1, { disabled: cur === pages }));
    }

    function pageSeq(cur, total) {
      if (total <= 7) { var a = []; for (var i = 1; i <= total; i++) a.push(i); return a; }
      var seq = [1];
      if (cur > 3) seq.push('…');
      for (var j = Math.max(2, cur - 1); j <= Math.min(total - 1, cur + 1); j++) seq.push(j);
      if (cur < total - 2) seq.push('…');
      seq.push(total);
      return seq;
    }

    function go(page) {
      state.page = page;
      render();
      feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Alphabet filter lives in the right sidebar (falls back to top of feed).
    var alphaHost = buildAlphaHost();

    function renderAlpha() {
      alphaHost.innerHTML = '';
      alphaHost.appendChild(el('div', 'aw-alpha-title', 'Filter by letter'));
      var row = el('div', 'aw-alpha-row');
      var all = el('button', 'aw-alpha' + (state.letter === '' ? ' aw-alpha-active' : ''), 'All');
      all.addEventListener('click', function () { setLetter(''); });
      row.appendChild(all);
      ALPHA.forEach(function (L) {
        var has = !!present[L];
        var b = el('button', 'aw-alpha' + (state.letter === L ? ' aw-alpha-active' : '') + (has ? '' : ' aw-alpha-off'), L);
        if (has) b.addEventListener('click', function () { setLetter(L); });
        else b.disabled = true;
        row.appendChild(b);
      });
      alphaHost.appendChild(row);
    }

    function setLetter(L) {
      state.letter = L;
      state.page = 1;
      if (L && L !== '#') location.hash = L.toLowerCase();
      else history.replaceState(null, '', location.pathname + location.search);
      render();
      feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // hash → initial letter (matches the old herbs/#b behaviour)
    var h = (location.hash || '').replace('#', '').toUpperCase();
    if (h.length === 1 && present[h]) state.letter = h;

    // ?q= → initial search term (used by the home-page row search boxes)
    var q0 = new URLSearchParams(location.search).get('q');
    if (q0) { state.query = q0; input.value = q0; }

    render();
  }

  // Place the alphabet filter into Material's right sidebar (secondary),
  // replacing the (now-empty) ToC. Fall back to a bar atop the feed.
  function buildAlphaHost() {
    var sidebar = document.querySelector('.md-sidebar--secondary .md-sidebar__scrollwrap');
    var host;
    if (sidebar) {
      var existing = sidebar.querySelector('.aw-alpha-host');
      if (existing) return existing;
      // Hide the auto ToC nav (no headings to speak of on a card feed)
      var toc = sidebar.querySelector('.md-nav--secondary');
      if (toc) toc.style.display = 'none';
      host = document.createElement('div');
      host.className = 'aw-alpha-host';
      sidebar.appendChild(host);
      return host;
    }
    // Fallback: top of the feed
    host = document.createElement('div');
    host.className = 'aw-alpha-host aw-alpha-host--inline';
    var feed = document.querySelector('.aw-feed');
    if (feed) feed.insertBefore(host, feed.firstChild);
    return host;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  if (typeof document$ !== 'undefined') {
    document$.subscribe(init);
  }
})();
