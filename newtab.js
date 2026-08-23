(function () {
  'use strict';

  const STORAGE_KEY = 'iconDash_links';
  const FAVICON_API = 'https://www.google.com/s2/favicons?domain=';

  // 默认示例链接
  const DEFAULT_LINKS = [
    { id: '1', name: 'GitHub',    url: 'https://github.com',       favicon: '' },
    { id: '2', name: 'Bilibili',  url: 'https://www.bilibili.com', favicon: '' },
    { id: '3', name: '百度',      url: 'https://www.baidu.com',    favicon: '' },
    { id: '4', name: '知乎',      url: 'https://www.zhihu.com',    favicon: '' },
    { id: '5', name: 'Google',    url: 'https://www.google.com',   favicon: '' },
    { id: '6', name: 'YouTube',   url: 'https://www.youtube.com',  favicon: '' },
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
  let dragGhost = null;
  let dragPlaceholder = null;
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
    links.forEach(ensureFavicon);
    saveLinks();
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
    const filtered = q
      ? links.filter(l =>
          l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
        )
      : links;

    iconGrid.innerHTML = '';

    filtered.forEach(link => {
      const card = createCard(link);
      iconGrid.appendChild(card);
    });

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

    // 创建或移动占位框 —— 找最近的卡片确定插入位置
    if (!dragPlaceholder) {
      dragPlaceholder = document.createElement('div');
      dragPlaceholder.className = 'drag-placeholder';
    }

    var pos = getClosestCard(e.clientX, e.clientY);
    if (pos.card) {
      if (pos.before) {
        iconGrid.insertBefore(dragPlaceholder, pos.card);
      } else {
        var next = pos.card.nextSibling;
        if (next) {
          iconGrid.insertBefore(dragPlaceholder, next);
        } else {
          iconGrid.appendChild(dragPlaceholder);
        }
      }
    } else {
      var addBtn = iconGrid.querySelector('.card-add');
      if (addBtn) {
        iconGrid.insertBefore(dragPlaceholder, addBtn);
      } else {
        iconGrid.appendChild(dragPlaceholder);
      }
    }
  });

  document.addEventListener('mouseup', function (e) {
    if (!dragSrcId) return;
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }

    if (!hasMoved) {
      if (dragPlaceholder) { dragPlaceholder.remove(); dragPlaceholder = null; }
      document.querySelectorAll('.card').forEach(function (c) { c.classList.remove('dragging'); });
      dragSrcId = null;
      return;
    }

    // 从 placeholder 在 DOM 中的位置计算插入索引
    var insertIdx = links.length;
    if (dragPlaceholder) {
      var gridChildren = Array.from(iconGrid.children);
      var placeholderIdx = gridChildren.indexOf(dragPlaceholder);
      if (placeholderIdx !== -1) {
        insertIdx = 0;
        for (var i = 0; i < placeholderIdx; i++) {
          var child = gridChildren[i];
          if (child.classList.contains('card') && child.dataset.id !== dragSrcId) {
            insertIdx++;
          }
        }
      }
      dragPlaceholder.remove();
      dragPlaceholder = null;
    }

    var srcIdx = links.findIndex(function (l) { return l.id === dragSrcId; });
    if (srcIdx === -1) { dragSrcId = null; return; }
    var moved = links.splice(srcIdx, 1)[0];
    links.splice(insertIdx, 0, moved);
    saveLinks();

    // FLIP animation for reorder
    var cards = iconGrid.querySelectorAll('.card');
    var oldRects = [];
    cards.forEach(function (c) { oldRects.push(c.getBoundingClientRect()); });

    // Reorder DOM to match links array
    var linkIdSet = new Set(links.map(function (l) { return l.id; }));
    var currentCards = iconGrid.querySelectorAll('.card');
    currentCards.forEach(function (c) {
      if (linkIdSet.has(c.dataset.id)) {
        iconGrid.appendChild(c);
      }
    });
    links.forEach(function (l) {
      var card = iconGrid.querySelector('.card[data-id="' + l.id + '"]');
      if (card) iconGrid.appendChild(card);
    });

    var newRects = [];
    cards.forEach(function (c) { newRects.push(c.getBoundingClientRect()); });

    // Apply inverse transforms
    cards.forEach(function (c, i) {
      var dy = oldRects[i].top - newRects[i].top;
      var dx = oldRects[i].left - newRects[i].left;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        c.style.transition = 'none';
        c.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      }
    });

    // Force reflow and animate to identity
    iconGrid.offsetHeight;
    cards.forEach(function (c) {
      c.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      c.style.transform = '';
    });

    // Clean up after animation
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

    dragSrcId = null;
  });

  // 找离鼠标最近的卡片，判断插入位置
  function getClosestCard(x, y) {
    var cards = iconGrid.querySelectorAll('.card');
    var best = null;
    var bestDist = Infinity;
    var before = true;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.dataset.id === dragSrcId) continue;
      var r = card.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var dist = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
        before = x < cx;
      }
    }

    return { card: best, before: before };
  }

  function createCard(link) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = link.url;
    card.setAttribute('data-id', link.id);

    card.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); // 阻止浏览器原生链接拖拽
      dragSrcId = link.id;
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