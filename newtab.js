(function () {
  'use strict';

  const STORAGE_KEY = 'iconDash_links';
  const FAVICON_API = 'https://www.google.com/s2/favicons?domain=';

  // 默认示例链接
  const DEFAULT_LINKS = [
    { id: '1', name: 'GitHub',    url: 'https://github.com',       favicon: '', pos: 0 },
    { id: '2', name: 'Bilibili',  url: 'https://www.bilibili.com', favicon: '', pos: 1 },
    { id: '3', name: '百度',      url: 'https://www.baidu.com',    favicon: '', pos: 2 },
    { id: '4', name: '知乎',      url: 'https://www.zhihu.com',    favicon: '', pos: 3 },
    { id: '5', name: 'Google',    url: 'https://www.google.com',   favicon: '', pos: 4 },
    { id: '6', name: 'YouTube',   url: 'https://www.youtube.com',  favicon: '', pos: 5 },
  ];

  // DOM 元素
  const searchInput = document.getElementById('searchInput');
  const iconGrid = document.getElementById('iconGrid');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const linkNameInput = document.getElementById('linkName');
  const linkUrlInput = document.getElementById('linkUrl');
  const btnSave = document.getElementById('btnSave');
  const btnCancel = document.getElementById('btnCancel');
  const contextMenu = document.getElementById('contextMenu');

  let links = [];
  let editingId = null;
  let contextTargetId = null;
  let importBookmarks = [];
  let dragSrcId = null;
  let dragSrcPos = -1;
  let dragGhost = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let hasMoved = false;

  // ========== 数据层 ==========

  function loadLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        links = JSON.parse(raw);
        if (!Array.isArray(links) || links.length === 0) {
          links = [...DEFAULT_LINKS];
        }
      } else {
        links = [...DEFAULT_LINKS];
      }
    } catch (e) {
      links = [...DEFAULT_LINKS];
    }
    migrateLinks();
    links.forEach(ensureFavicon);
    saveLinks();
  }

  function migrateLinks() {
    var needsMigration = links.some(function (l) { return l.pos === undefined; });
    if (needsMigration) {
      links.forEach(function (l, i) { l.pos = i; });
    }
  }

  function getNextPos() {
    if (links.length === 0) return 0;
    return Math.max.apply(null, links.map(function (l) { return l.pos; })) + 1;
  }

  function saveLinks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  }

  function ensureFavicon(link) {
    if (!link.favicon) {
      const domain = extractDomain(link.url);
      link.favicon = domain ? FAVICON_API + domain + '&sz=64' : '';
    }
  }

  // ========== 渲染 ==========

  function render(query) {
    const q = (query || '').toLowerCase().trim();
    iconGrid.innerHTML = '';

    if (q) {
      // 搜索模式：紧密排列匹配的卡片
      links.forEach(function (link) {
        if (link.name.toLowerCase().indexOf(q) !== -1 || link.url.toLowerCase().indexOf(q) !== -1) {
          iconGrid.appendChild(createCard(link));
        }
      });
    } else {
      // 正常模式：稀疏布局，按 pos 排序，空位渲染为空白单元格
      var sorted = links.slice().sort(function (a, b) { return a.pos - b.pos; });
      var maxPos = sorted.length > 0 ? sorted[sorted.length - 1].pos : -1;
      var posMap = {};
      sorted.forEach(function (l) { posMap[l.pos] = l; });

      for (var pos = 0; pos <= maxPos; pos++) {
        var link = posMap[pos];
        if (link) {
          iconGrid.appendChild(createCard(link));
        } else {
          var empty = document.createElement('div');
          empty.className = 'cell-empty';
          empty.setAttribute('data-pos', pos);
          iconGrid.appendChild(empty);
        }
      }
    }

    // 添加按钮
    const addCard = document.createElement('div');
    addCard.className = 'card-add';
    addCard.innerHTML = `
      <div class="plus">+</div>
      <span class="add-text">添加</span>
    `;
    addCard.addEventListener('click', () => openModal());
    iconGrid.appendChild(addCard);
  }

  // 鼠标拖拽 —— 全局移动与释放
  document.addEventListener('mousemove', function (e) {
    if (!dragSrcId) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    if (!hasMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    hasMoved = true;

    // 创建或更新拖拽幽灵
    if (!dragGhost) {
      dragGhost = document.createElement('div');
      dragGhost.className = 'drag-ghost';
      document.body.appendChild(dragGhost);
    }
    dragGhost.style.left = (e.clientX - 21) + 'px';
    dragGhost.style.top = (e.clientY - 21) + 'px';

    // 高亮最近的目标单元格
    var targetPos = getClosestCell(e.clientX, e.clientY);
    var allCells = iconGrid.querySelectorAll('.card, .cell-empty');
    for (var i = 0; i < allCells.length; i++) {
      allCells[i].classList.remove('drag-target');
    }
    if (targetPos !== null) {
      var targetCell = iconGrid.querySelector('[data-pos="' + targetPos + '"]');
      if (targetCell) targetCell.classList.add('drag-target');
    }
  });

  document.addEventListener('mouseup', function (e) {
    if (!dragSrcId) return;
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }

    // 清除所有高亮
    var allCells = iconGrid.querySelectorAll('.card, .cell-empty');
    for (var i = 0; i < allCells.length; i++) {
      allCells[i].classList.remove('drag-target');
    }

    if (!hasMoved) {
      document.querySelectorAll('.card').forEach(function (c) { c.classList.remove('dragging'); });
      dragSrcId = null;
      dragSrcPos = -1;
      return;
    }

    var targetPos = getClosestCell(e.clientX, e.clientY);

    if (targetPos !== null && targetPos !== dragSrcPos) {
      // 记录旧位置（按 ID，因为 render 会重建 DOM）
      var oldRects = {};
      document.querySelectorAll('.card').forEach(function (c) {
        oldRects[c.dataset.id] = c.getBoundingClientRect();
      });

      var srcLink = links.find(function (l) { return l.id === dragSrcId; });
      var targetLink = links.find(function (l) { return l.pos === targetPos && l.id !== dragSrcId; });

      if (targetLink) {
        // 交换位置
        targetLink.pos = dragSrcPos;
        srcLink.pos = targetPos;
      } else {
        // 移动到空位
        srcLink.pos = targetPos;
      }

      saveLinks();
      render(searchInput.value);

      // FLIP animation
      var cards = document.querySelectorAll('.card');
      cards.forEach(function (c) {
        var oldRect = oldRects[c.dataset.id];
        if (!oldRect) return;
        var newRect = c.getBoundingClientRect();
        var dx = oldRect.left - newRect.left;
        var dy = oldRect.top - newRect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          c.style.transition = 'none';
          c.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        }
      });

      iconGrid.offsetHeight;

      cards.forEach(function (c) {
        c.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
        c.style.transform = '';
      });

      var firstCard = cards[0];
      if (firstCard) {
        firstCard.addEventListener('transitionend', function cleanup() {
          firstCard.removeEventListener('transitionend', cleanup);
          cards.forEach(function (c) {
            c.style.transition = '';
            c.classList.remove('dragging');
          });
        });
      }
    } else {
      document.querySelectorAll('.card').forEach(function (c) { c.classList.remove('dragging'); });
    }

    dragSrcId = null;
    dragSrcPos = -1;
  });

  // 找离鼠标最近的单元格（卡片或空位），返回其 pos
  function getClosestCell(x, y) {
    var cells = iconGrid.querySelectorAll('.card, .cell-empty');
    var best = null;
    var bestDist = Infinity;

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.dataset.id === dragSrcId) continue;
      var r = cell.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dist = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }

    if (best && best.dataset.pos !== undefined) {
      return parseInt(best.dataset.pos);
    }
    return null;
  }

  function createCard(link) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = link.url;
    card.setAttribute('data-id', link.id);
    card.setAttribute('data-pos', link.pos);

    card.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragSrcId = link.id;
      dragSrcPos = link.pos;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      hasMoved = false;
      card.classList.add('dragging');
    });

    const iconWrap = document.createElement('div');
    iconWrap.className = 'card-icon';

    if (link.favicon) {
      const img = document.createElement('img');
      img.src = link.favicon;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () {
        img.style.display = 'none';
        iconWrap.appendChild(createFallback(link.name));
      };
      iconWrap.appendChild(img);
    } else {
      iconWrap.appendChild(createFallback(link.name));
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'card-name';
    nameEl.textContent = link.name;

    card.appendChild(iconWrap);
    card.appendChild(nameEl);

    card.addEventListener('click', function (e) {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      contextTargetId = link.id;
      showContextMenu(e.clientX, e.clientY);
    });

    return card;
  }

  function createFallback(name) {
    const el = document.createElement('div');
    el.className = 'fallback';
    el.textContent = (name || '?')[0].toUpperCase();
    return el;
  }

  // ========== 收藏夹导入 ==========

  const btnImport = document.getElementById('btnImport');
  const importOverlay = document.getElementById('importOverlay');
  const importList = document.getElementById('importList');
  const importCount = document.getElementById('importCount');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnImportCancel = document.getElementById('btnImportCancel');
  const btnImportConfirm = document.getElementById('btnImportConfirm');

  btnImport.addEventListener('click', openImportModal);

  function openImportModal() {
    if (!chrome || !chrome.bookmarks) {
      alert('此功能需要在 Chrome 扩展环境中使用');
      return;
    }
    importOverlay.classList.add('active');
    importList.innerHTML = '<div class="import-empty">加载中...</div>';
    chrome.bookmarks.getTree().then(function (tree) {
      importBookmarks = extractBookmarks(tree);
      renderImportList();
      updateImportCount();
    }).catch(function () {
      importList.innerHTML = '<div class="import-empty">加载失败，请重试</div>';
    });
  }

  function extractBookmarks(nodes) {
    var result = [];
    function walk(node) {
      if (node.url) {
        result.push({ title: node.title, url: node.url });
      }
      if (node.children) {
        node.children.forEach(walk);
      }
    }
    nodes.forEach(walk);
    return result;
  }

  function renderImportList() {
    if (importBookmarks.length === 0) {
      importList.innerHTML = '<div class="import-empty">收藏夹中没有链接</div>';
      btnSelectAll.style.display = 'none';
      return;
    }
    btnSelectAll.style.display = '';

    var existingUrls = new Set(links.map(function (l) { return l.url; }));
    var html = '';
    importBookmarks.forEach(function (bm, i) {
      var domain = extractDomain(bm.url);
      var favicon = domain ? FAVICON_API + domain + '&sz=64' : '';
      var isDuplicate = existingUrls.has(bm.url);
      html +=
        '<label class="import-item">' +
          '<input type="checkbox" value="' + i + '" ' + (isDuplicate ? 'disabled' : 'checked') + '>' +
          '<img class="import-item-favicon" src="' + favicon + '" onerror="this.style.display=\'none\'" loading="lazy">' +
          '<div class="import-item-info">' +
            '<div class="import-item-name">' + escapeHtml(bm.title) + (isDuplicate ? ' <span style="color:var(--text-secondary);font-size:11px">(已存在)</span>' : '') + '</div>' +
            '<div class="import-item-url">' + escapeHtml(bm.url) + '</div>' +
          '</div>' +
        '</label>';
    });
    importList.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateImportCount() {
    var checked = importList.querySelectorAll('input[type="checkbox"]:checked');
    importCount.textContent = '已选 ' + checked.length + ' 项';
  }

  importList.addEventListener('change', function (e) {
    if (e.target.type === 'checkbox') {
      updateImportCount();
    }
  });

  btnSelectAll.addEventListener('click', function () {
    var checkboxes = importList.querySelectorAll('input[type="checkbox"]:not(:disabled)');
    var allChecked = Array.from(checkboxes).every(function (cb) { return cb.checked; });
    checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
    btnSelectAll.textContent = allChecked ? '全选' : '取消全选';
    updateImportCount();
  });

  btnImportConfirm.addEventListener('click', function () {
    var checked = importList.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0) {
      closeImportModal();
      return;
    }
    var imported = 0;
    var nextPos = getNextPos();
    var existingUrls = new Set(links.map(function (l) { return l.url; }));
    checked.forEach(function (cb) {
      var bm = importBookmarks[parseInt(cb.value)];
      if (!bm || existingUrls.has(bm.url)) return;
      var domain = extractDomain(bm.url);
      links.push({
        id: generateId(),
        name: bm.title,
        url: bm.url,
        favicon: domain ? FAVICON_API + domain + '&sz=64' : '',
        pos: nextPos++,
      });
      existingUrls.add(bm.url);
      imported++;
    });
    saveLinks();
    render(searchInput.value);
    closeImportModal();
  });

  function closeImportModal() {
    importOverlay.classList.remove('active');
    importBookmarks = [];
  }

  btnImportCancel.addEventListener('click', closeImportModal);
  importOverlay.addEventListener('click', function (e) {
    if (e.target === importOverlay) closeImportModal();
  });

  let searchTimer;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => render(searchInput.value), 80);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      if (q) {
        // 如果输入的是网址，直接打开
        if (isURL(q)) {
          window.location.href = ensureProtocol(q);
          return;
        }
        // 搜索匹配
        const matches = links.filter(l =>
          l.name.toLowerCase().includes(q.toLowerCase()) ||
          l.url.toLowerCase().includes(q.toLowerCase())
        );
        if (matches.length === 1) {
          window.location.href = matches[0].url;
        } else if (matches.length > 1) {
          // 跳转到第一个匹配
          window.location.href = matches[0].url;
        }
      } else {
        openModal();
      }
    }
  });

  function isURL(str) {
    return /^(https?:\/\/)?[\w.-]+\.\w{2,}(\/\S*)?$/.test(str);
  }

  function ensureProtocol(url) {
    if (!/^https?:\/\//i.test(url)) {
      return 'https://' + url;
    }
    return url;
  }

  // ========== Modal ==========

  function openModal(link) {
    if (link) {
      editingId = link.id;
      modalTitle.textContent = '编辑链接';
      linkNameInput.value = link.name;
      linkUrlInput.value = link.url;
    } else {
      editingId = null;
      modalTitle.textContent = '添加链接';
      linkNameInput.value = '';
      linkUrlInput.value = '';
    }
    modalOverlay.classList.add('active');
    setTimeout(() => linkNameInput.focus(), 100);
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    editingId = null;
  }

  btnSave.addEventListener('click', function () {
    const name = linkNameInput.value.trim();
    const url = ensureProtocol(linkUrlInput.value.trim());

    if (!name) { linkNameInput.focus(); return; }
    if (!url || url === 'https://') { linkUrlInput.focus(); return; }

    const domain = extractDomain(url);
    const favicon = domain ? FAVICON_API + domain + '&sz=64' : '';

    if (editingId) {
      const idx = links.findIndex(l => l.id === editingId);
      if (idx !== -1) {
        links[idx].name = name;
        links[idx].url = url;
        links[idx].favicon = favicon;
      }
    } else {
      links.push({
        id: generateId(),
        name: name,
        url: url,
        favicon: favicon,
        pos: getNextPos(),
      });
    }

    saveLinks();
    render(searchInput.value);
    closeModal();
  });

  btnCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) closeModal();
  });

  // ========== 右键菜单 ==========

  function showContextMenu(x, y) {
    contextMenu.classList.remove('exiting');
    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';

    // 防止溢出屏幕
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = (y - rect.height) + 'px';
    }
  }

  function hideContextMenu() {
    var menu = contextMenu;
    if (menu.style.display === 'none') return;
    menu.classList.add('exiting');
    menu.addEventListener('animationend', function handler() {
      menu.removeEventListener('animationend', handler);
      menu.classList.remove('exiting');
      menu.style.display = 'none';
    });
    contextTargetId = null;
  }

  contextMenu.addEventListener('click', function (e) {
    const item = e.target.closest('.context-item');
    if (!item || !contextTargetId) return;

    const action = item.dataset.action;
    if (action === 'edit') {
      const link = links.find(l => l.id === contextTargetId);
      if (link) openModal(link);
    } else if (action === 'delete') {
      links = links.filter(l => l.id !== contextTargetId);
      saveLinks();
      render(searchInput.value);
    }
    hideContextMenu();
  });

  document.addEventListener('click', function (e) {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // ========== 键盘快捷键 ==========

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal();
      closeImportModal();
      hideContextMenu();
      searchInput.blur();
    }
  });

  // 自动聚焦搜索框
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') return;
    if (document.activeElement === document.body && e.key.length === 1) {
      searchInput.focus();
    }
  });

  // ========== 初始化 ==========

  loadLinks();
  render();
  searchInput.focus();
  initTime();
  initTheme();

  // ========== 主题切换 ==========

  function initTheme() {
    var saved = localStorage.getItem('iconDash_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('iconDash_theme', next);
    });
  }

  // ========== 时间显示 ==========

  function initTime() {
    var timeEl = document.getElementById('timeDisplay');
    var dateEl = document.getElementById('dateDisplay');
    if (!timeEl || !dateEl) return;

    function update() {
      var now = new Date();
      var h = now.getHours().toString().padStart(2, '0');
      var m = now.getMinutes().toString().padStart(2, '0');
      timeEl.textContent = h + ':' + m;

      var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      dateEl.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + days[now.getDay()];
    }
    update();
    setInterval(update, 10000);
  }

    })();