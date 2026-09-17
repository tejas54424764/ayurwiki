// Ayurwiki — Recent Changes table pagination
(function () {
  'use strict';

  var PER_PAGE = 25;

  function init() {
    // Only run on the Recent Changes page (strip the permalink "¶" the toc adds)
    var heading = document.querySelector('h1');
    if (!heading) return;
    var htext = heading.textContent.replace(/¶/g, '').trim();
    if (htext !== 'Recent Changes') return;

    var table = document.querySelector('.md-typeset table');
    if (!table) return;

    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Guard against double init (initial load + instant-nav both fire)
    if (table.parentNode.querySelector('.rc-pagination')) return;

    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    if (rows.length <= PER_PAGE) return;

    var totalPages = Math.ceil(rows.length / PER_PAGE);
    var currentPage = 1;

    // Create pagination container
    var nav = document.createElement('nav');
    nav.className = 'rc-pagination';
    table.parentNode.insertBefore(nav, table.nextSibling);

    // Also add entry count above table
    var info = document.createElement('div');
    info.className = 'rc-info';
    table.parentNode.insertBefore(info, table);

    function render() {
      var start = (currentPage - 1) * PER_PAGE;
      var end = start + PER_PAGE;

      rows.forEach(function (row, i) {
        row.style.display = (i >= start && i < end) ? '' : 'none';
      });

      info.textContent = 'Showing ' + (start + 1) + '–' + Math.min(end, rows.length) + ' of ' + rows.length + ' changes';

      // Build pagination controls
      var html = '';

      // Previous
      html += '<button class="rc-btn' + (currentPage === 1 ? ' rc-disabled' : '') + '" data-page="' + (currentPage - 1) + '">&laquo; Prev</button>';

      // Page numbers with ellipsis
      var pages = buildPageList(currentPage, totalPages);
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        if (p === '...') {
          html += '<span class="rc-ellipsis">&hellip;</span>';
        } else {
          html += '<button class="rc-btn' + (p === currentPage ? ' rc-active' : '') + '" data-page="' + p + '">' + p + '</button>';
        }
      }

      // Next
      html += '<button class="rc-btn' + (currentPage === totalPages ? ' rc-disabled' : '') + '" data-page="' + (currentPage + 1) + '">Next &raquo;</button>';

      nav.innerHTML = html;

      // Bind click handlers
      var buttons = nav.querySelectorAll('.rc-btn:not(.rc-disabled)');
      for (var j = 0; j < buttons.length; j++) {
        buttons[j].addEventListener('click', function () {
          var page = parseInt(this.getAttribute('data-page'), 10);
          if (page >= 1 && page <= totalPages) {
            currentPage = page;
            render();
            // Scroll to table top
            table.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
    }

    render();
  }

  function buildPageList(current, total) {
    if (total <= 7) {
      var all = [];
      for (var i = 1; i <= total; i++) all.push(i);
      return all;
    }
    var pages = [1];
    if (current > 3) pages.push('...');
    for (var j = Math.max(2, current - 1); j <= Math.min(total - 1, current + 1); j++) {
      pages.push(j);
    }
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }

  // Run on initial load and on MkDocs instant navigation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // MkDocs Material instant loading support
  if (typeof document$ !== 'undefined') {
    document$.subscribe(init);
  }
})();
