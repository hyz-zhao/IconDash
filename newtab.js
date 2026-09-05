(function () {
  'use strict';

  const STORAGE_KEY = 'iconDash_links';
  const FAVICON_API = 'https://www.google.com/s2/favicons?domain=';
  const SNAP_X = 80;
  const SNAP_Y = 95;

  // 默认示例链接
  const DEFAULT_LINKS = [
    { id: '1', name: 'GitHub',    url: 'https://github.com',       favicon: '', x: 160, y: 0 },
    { id: '2', name: 'Bilibili',  url: 'https://www.bilibili.com', favicon: '', x: 240, y: 0 },
    { id: '3', name: '百度',      url: 'https://www.baidu.com',    favicon: '', x: 320, y: 0 },
    { id: '4', name: '知乎',      url: 'https://www.zhihu.com',    favicon: '', x: 400, y: 0 },
    { id: '5', name: 'Google',    url: 'https://www.google.com',   favicon: '', x: 480, y: 0 },
    { id: '6', name: 'YouTube',   url: 'https://www.youtube.com',  favicon: '', x: 560, y: 0 },
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
  let dragSrcX = 0;
  let dragSrcY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let linkStartX = 0;
  let linkStartY = 0;
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
    var needsMigration = links.some(function (l) { return l.x === undefined || l.pos !== undefined; });
    if (needsMigration) {
      var cols = 10; // 默认 10 列（800px / 80px）
      links.forEach(function (l) {
        if (l.x === undefined) {
          if (l.pos !== undefined) {
            l.x = (l.pos % cols) * SNAP_X;
            l.y = Math.floor(l.pos / cols) * SNAP_Y;
            delete l.pos;
          } else {
            l.x = 0;
            l.y = 0;
          }
        }
        if (l.pos !== undefined) delete l.pos;
      });
    }

    // 检测旧网格间距（100px → 80px），重新吸附
    var needsResnap = links.some(function (l) { return l.x % SNAP_X !== 0 || l.y % SNAP_Y !== 0; });
    if (needsResnap) {
      var occupied = new Set();
      links.forEach(function (l) {
        l.x = Math.round(l.x / SNAP_X) * SNAP_X;
        l.y = Math.round(l.y / SNAP_Y) * SNAP_Y;
        var key = l.x + ',' + l.y;
        while (occupied.has(key)) {
          l.x += SNAP_X;
          if (l.x > 720) { l.x = 0; l.y += SNAP_Y; }
          key = l.x + ',' + l.y;
        }
        occupied.add(key);
      });
    }
  }

  function getNextSlot() {
    var occupied = new Set();
    links.forEach(function (l) { occupied.add(l.x + ',' + l.y); });
    var col = 0, row = 0;
    while (occupied.has((col * SNAP_X) + ',' + (row * SNAP_Y))) {
      col++;
      if (col * SNAP_X >= 800) { col = 0; row++; }
    }
    return { x: col * SNAP_X, y: row * SNAP_Y };
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

    var maxY = 0;
    links.forEach(function (link) {
      if (q && link.name.toLowerCase().indexOf(q) === -1 && link.url.toLowerCase().indexOf(q) === -1) {
        return;
      }
      iconGrid.appendChild(createCard(link));
      if (link.y > maxY) maxY = link.y;
    });

    // 动态调整容器高度
    iconGrid.style.minHeight = (maxY + 120) + 'px';
  }

  // 鼠标拖拽 —— 全局移动与释放
  document.addEventListener('mousemove', function (e) {
    if (!dragSrcId) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    if (!hasMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    hasMoved = true;

    var card = iconGrid.querySelector('.card[data-id="' + dragSrcId + '"]');
    if (!card) return;

    // 计算新位置，吸附到网格
    var newX = linkStartX + dx;
    var newY = linkStartY + dy;
    newX = Math.min(720, Math.max(0, Math.round(newX / SNAP_X) * SNAP_X));
    newY = Math.max(0, Math.round(newY / SNAP_Y) * SNAP_Y);

    card.style.left = newX + 'px';
    card.style.top = newY + 'px';
    card.style.zIndex = '10';
  });

  document.addEventListener('mouseup', function (e) {
    if (!dragSrcId) return;

    var card = iconGrid.querySelector('.card[data-id="' + dragSrcId + '"]');

    if (!hasMoved) {
      if (card) { card.classList.remove('dragging'); card.style.zIndex = ''; }
      dragSrcId = null;
      return;
    }

    // 计算最终吸附位置
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    var newX = linkStartX + dx;
    var newY = linkStartY + dy;
    newX = Math.min(720, Math.max(0, Math.round(newX / SNAP_X) * SNAP_X));
    newY = Math.max(0, Math.round(newY / SNAP_Y) * SNAP_Y);

    // 记录旧位置（render 前）
    var oldRects = {};
    document.querySelectorAll('.card').forEach(function (c) {
      oldRects[c.dataset.id] = c.getBoundingClientRect();
    });

    var srcLink = links.find(function (l) { return l.id === dragSrcId; });
    if (srcLink) {
      // 处理重叠：目标位置被占用时交换
      var occupiedLink = links.find(function (l) {
        return l.id !== dragSrcId && l.x === newX && l.y === newY;
      });
      if (occupiedLink) {
        occupiedLink.x = dragSrcX;
        occupiedLink.y = dragSrcY;
      }
      srcLink.x = newX;
      srcLink.y = newY;
    }

    saveLinks();
    render(searchInput.value);

    // FLIP animation
    var cards = document.querySelectorAll('.card');
    cards.forEach(function (c) {
      var oldRect = oldRects[c.dataset.id];
      if (!oldRect) return;
      var newRect = c.getBoundingClientRect();
      var flipDx = oldRect.left - newRect.left;
      var flipDy = oldRect.top - newRect.top;
      if (Math.abs(flipDx) > 0.5 || Math.abs(flipDy) > 0.5) {
        c.style.transition = 'none';
        c.style.transform = 'translate(' + flipDx + 'px, ' + flipDy + 'px)';
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
          c.style.zIndex = '';
          c.classList.remove('dragging');
        });
      });
    }

    dragSrcId = null;
  });

  function createCard(link) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = link.url;
    card.setAttribute('data-id', link.id);
    card.style.left = link.x + 'px';
    card.style.top = link.y + 'px';

    card.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragSrcId = link.id;
      dragSrcX = link.x;
      dragSrcY = link.y;
      linkStartX = link.x;
      linkStartY = link.y;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      hasMoved = false;
      card.classList.add('dragging');
    });

    const iconWrap = document.createElement('div');
    iconWrap.className = 'card-icon';

    const fallback = createFallback(link.name);
    iconWrap.appendChild(fallback);

    if (link.favicon) {
      const img = document.createElement('img');
      img.src = link.favicon;
      img.alt = '';
      img.loading = 'lazy';
      img.style.display = 'none';
      img.onload = function () {
        fallback.style.display = 'none';
        img.style.display = '';
      };
      img.onerror = function () {
        img.remove();
      };
      iconWrap.appendChild(img);
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
      var slot = getNextSlot();
      links.push({
        id: generateId(),
        name: bm.title,
        url: bm.url,
        favicon: domain ? FAVICON_API + domain + '&sz=64' : '',
        x: slot.x,
        y: slot.y,
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
      var slot = getNextSlot();
      links.push({
        id: generateId(),
        name: name,
        url: url,
        favicon: favicon,
        x: slot.x,
        y: slot.y,
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

  // 添加按钮
  var btnAdd = document.getElementById('btnAdd');
  if (btnAdd) btnAdd.addEventListener('click', function () { openModal(); });

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
    var greetingEl = document.getElementById('greeting');
    var timeEl = document.getElementById('timeDisplay');
    var dateEl = document.getElementById('dateDisplay');
    if (!timeEl || !dateEl) return;

    function update() {
      var now = new Date();
      var hours = now.getHours();
      var h = hours.toString().padStart(2, '0');
      var m = now.getMinutes().toString().padStart(2, '0');
      timeEl.textContent = h + ':' + m;

      if (greetingEl) {
        var g = hours < 6 ? '夜深了' : hours < 9 ? '早上好' : hours < 12 ? '上午好' : hours < 18 ? '下午好' : '晚上好';
        greetingEl.textContent = g;
      }

      var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      dateEl.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + days[now.getDay()];
    }
    update();
    setInterval(update, 10000);
  }

    })();

/* ============================================================
 * 壁纸设置模块（独立作用域）
 * 支持：内置壁纸主题 / 本机图片 / 本地视频（File System Access）
 *       / 背景压暗 / 持久化
 * ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'iconDash_wallpaper';
  var IMG_KEY = 'image';
  var VIDEO_KEY = 'videoHandle';
  var PRESET_SET = { dawn: 1, mist: 1, dusk: 1, sage: 1 };

  var OPTIONS = [
    { mode: 'orb',  preset: null,  name: '动态光晕', swatch: 'orb' },
    { mode: 'grad', preset: 'dawn', name: '晨雾',    swatch: 'dawn' },
    { mode: 'grad', preset: 'mist', name: '云雾',    swatch: 'mist' },
    { mode: 'grad', preset: 'dusk', name: '暮紫',    swatch: 'dusk' },
    { mode: 'grad', preset: 'sage', name: '森语',    swatch: 'sage' }
  ];

  var panel = document.getElementById('wallpaperPanel');
  var toggle = document.getElementById('wallpaperToggle');
  var grid = document.getElementById('wallpaperOptions');
  var pickBtn = document.getElementById('wpPickImage');
  var videoPickBtn = document.getElementById('wpPickVideo');
  var clearBtn = document.getElementById('wpClear');
  var dimInput = document.getElementById('wpDim');
  var dimVal = document.getElementById('wpDimVal');
  var fileInput = document.getElementById('wallpaperFile');
  var videoInput = document.getElementById('wallpaperVideoFile');
  var wallVideo = document.getElementById('wallVideo');
  var hintEl = document.getElementById('wpHint');
  var themeToggle = document.getElementById('themeToggle');

  var state = loadState();
  var currentImageUrl = null;
  var currentVideoUrl = null;
  var currentVideoFile = null;   // 非 File System Access 时的会话级视频文件
  var videoRetryArmed = false;
  var hintTimer = null;
  var DEFAULT_HINT = hintEl ? hintEl.textContent : '';

  /* ---------- 状态读写 ---------- */

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && s.mode) return { mode: s.mode, preset: s.preset || null, dim: typeof s.dim === 'number' ? s.dim : null };
    } catch (e) { /* ignore */ }
    return { mode: 'orb', preset: null, dim: null };
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /* 自动压暗：未手动拖动滑杆时，深色主题且使用壁纸 → 自动压暗保证可读性 */
  function autoDim() {
    if (isDark()) return state.mode === 'orb' ? 0 : 0.38;
    return state.mode === 'orb' ? 0 : 0.1;
  }

  function effDim() {
    return state.dim === null ? autoDim() : state.dim / 100;
  }

  function applyDimUI() {
    var d = Math.round(effDim() * 100);
    document.documentElement.style.setProperty('--wall-dim', (d / 100).toFixed(2));
    if (dimInput) dimInput.value = d;
    if (dimVal) dimVal.textContent = d + '%';
  }

  /* ---------- IndexedDB 存取（用于大图壁纸） ---------- */

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('iconDashWallpaper', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('wall')) db.createObjectStore('wall');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(key, val) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('wall', 'readwrite');
        tx.objectStore('wall').put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('wall', 'readonly');
        var rq = tx.objectStore('wall').get(key);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }

  function idbDel(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('wall', 'readwrite');
        tx.objectStore('wall').delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* ---------- 图片压缩处理 ---------- */

  function processImage(file, done) {
    if (!file || !/^image\//.test(file.type)) { done(null); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var MAX_W = 2560, MAX_H = 1600;
      var ratio = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
      var w = Math.max(1, Math.round(img.naturalWidth * ratio));
      var h = Math.max(1, Math.round(img.naturalHeight * ratio));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0b0d1c';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(function (blob) {
        URL.revokeObjectURL(url);
        done(blob);
      }, 'image/jpeg', 0.9);
    };
    img.onerror = function () { URL.revokeObjectURL(url); done(null); };
    img.src = url;
  }

  /* ---------- 应用壁纸 ---------- */

  function clearImageSrc() {
    if (currentImageUrl) { URL.revokeObjectURL(currentImageUrl); currentImageUrl = null; }
    document.documentElement.style.removeProperty('--wall-image-src');
  }

  function fallbackToOrb() {
    state.mode = 'orb';
    state.preset = null;
    saveState();
    applyWallpaper();
  }

  /* ---------- 视频壁纸 ---------- */

  function stopVideo() {
    videoRetryArmed = false;
    currentVideoFile = null;
    if (wallVideo) {
      wallVideo.pause();
      wallVideo.onerror = null;
      wallVideo.removeAttribute('src');
      try { wallVideo.load(); } catch (e) { /* ignore */ }
    }
    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }
  }

  function attachVideoSource(file) {
    if (!wallVideo || !file) return;
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(file);
    wallVideo.src = currentVideoUrl;
    wallVideo.onerror = function () {
      stopVideo();
      fallbackToOrb();
    };
    var p = wallVideo.play();
    if (p && p.catch) p.catch(function () { /* 自动播放被拦截时保持静默，首帧仍显示 */ });
  }

  function loadVideoWallpaper() {
    if (!wallVideo) { fallbackToOrb(); return; }
    idbGet(VIDEO_KEY).then(function (handle) {
      if (!handle || typeof handle.getFile !== 'function') { fallbackToOrb(); return; }
      var permCheck = handle.queryPermission
        ? handle.queryPermission({ mode: 'read' })
        : Promise.resolve('granted');
      permCheck.then(function (perm) {
        if (perm === 'granted') {
          return handle.getFile();
        }
        // 未授权（例如权限被清理）：等待用户首次点击时再请求授权
        videoRetryArmed = true;
        var once = function () {
          document.removeEventListener('pointerdown', once);
          if (!videoRetryArmed) return;
          authorizeAndPlay(handle);
        };
        document.addEventListener('pointerdown', once);
        return null;
      }).then(function (file) {
        if (file) attachVideoSource(file);
      }).catch(function () { fallbackToOrb(); });
    }).catch(function () { fallbackToOrb(); });
  }

  function authorizeAndPlay(handle) {
    if (!handle || typeof handle.requestPermission !== 'function') {
      fallbackToOrb();
      return;
    }
    handle.requestPermission({ mode: 'read' }).then(function (perm) {
      if (perm !== 'granted') { fallbackToOrb(); return; }
      return handle.getFile();
    }).then(function (file) {
      if (file) attachVideoSource(file);
    }).catch(function () { fallbackToOrb(); });
  }

  function authorizeAndSetVideo(handle) {
    var req = handle.queryPermission
      ? handle.queryPermission({ mode: 'read' })
      : Promise.resolve('granted');
    req.then(function (perm) {
      if (perm !== 'granted') {
        if (typeof handle.requestPermission !== 'function') throw new Error('无法读取该文件');
        return handle.requestPermission({ mode: 'read' }).then(function (p) {
          if (p !== 'granted') throw new Error('未授予读取权限');
        });
      }
      return null;
    }).then(function () {
      return idbPut(VIDEO_KEY, handle);
    }).then(function () {
      currentVideoFile = null;
      state.mode = 'video';
      state.preset = null;
      saveState();
      applyWallpaper();
      closePanel();
    }).catch(function (e) {
      setNote('无法使用该视频：' + (e && e.message ? e.message : '未知错误'));
    });
  }

  function pickVideo() {
    if (window.showOpenFilePicker) {
      window.showOpenFilePicker({
        types: [{
          description: '视频壁纸',
          accept: { 'video/*': ['.mp4', '.webm', '.mov', '.mkv'] }
        }],
        excludeAcceptAllOption: false
      }).then(function (handles) {
        var h = handles && handles[0];
        if (!h) return;
        if (h.kind !== 'file') { setNote('请选择视频文件'); return; }
        authorizeAndSetVideo(h);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return; // 用户取消
        setNote('选择失败：' + (err && err.message ? err.message : '未知错误'));
      });
    } else if (videoInput) {
      // 降级：普通文件选择，仅本次会话有效
      videoInput.click();
    } else {
      setNote('当前浏览器不支持选择本地视频');
    }
  }

  function applyWallpaper() {
    var root = document.documentElement;
    if (state.mode === 'video') {
      var sessionFile = currentVideoFile;
      stopVideo(); // 若此前正是视频模式，先释放旧资源再重载
      clearImageSrc();
      root.setAttribute('data-wall', 'video');
      applyDimUI();
      syncUI();
      if (sessionFile) {
        currentVideoFile = sessionFile;
        attachVideoSource(sessionFile);
        return;
      }
      loadVideoWallpaper();
      return;
    }
    stopVideo();
    if (state.mode === 'orb') {
      root.removeAttribute('data-wall');
      clearImageSrc();
      applyDimUI();
      syncUI();
      return;
    }
    if (state.mode === 'grad' && PRESET_SET[state.preset]) {
      clearImageSrc();
      root.setAttribute('data-wall', state.preset);
      applyDimUI();
      syncUI();
      return;
    }
    if (state.mode === 'image') {
      root.setAttribute('data-wall', 'image');
      idbGet(IMG_KEY).then(function (blob) {
        if (!blob) { fallbackToOrb(); return; }
        if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
        currentImageUrl = URL.createObjectURL(blob);
        root.style.setProperty('--wall-image-src', 'url("' + currentImageUrl + '")');
        applyDimUI();
        syncUI();
      }).catch(function () { fallbackToOrb(); });
      return;
    }
    fallbackToOrb();
  }

  function setMode(mode, preset) {
    state.mode = mode;
    state.preset = preset || null;
    saveState();
    applyWallpaper();
  }

  /* ---------- 面板 UI ---------- */

  function renderOptions() {
    if (!grid) return;
    grid.innerHTML = '';
    OPTIONS.forEach(function (o) {
      var el = document.createElement('div');
      el.className = 'wp-option';
      el.dataset.mode = o.mode;
      el.dataset.preset = o.preset || '';
      var sw = document.createElement('div');
      sw.className = 'wp-swatch ' + o.swatch;
      var nm = document.createElement('div');
      nm.className = 'wp-name';
      nm.textContent = o.name;
      el.appendChild(sw);
      el.appendChild(nm);
      el.addEventListener('click', function () {
        setMode(o.mode, o.preset);
        closePanel();
      });
      grid.appendChild(el);
    });
  }

  function syncUI() {
    if (!grid) return;
    var kids = grid.children;
    for (var i = 0; i < kids.length; i++) {
      var o = OPTIONS[i];
      var active = o.mode === state.mode && o.preset === state.preset;
      kids[i].classList.toggle('active', active);
    }
  }

  function setNote(msg, ms) {
    if (!hintEl) return;
    hintEl.textContent = msg;
    if (hintTimer) clearTimeout(hintTimer);
    if (ms) {
      hintTimer = setTimeout(function () { hintEl.textContent = DEFAULT_HINT; }, ms);
    }
  }

  function openPanel() {
    if (!panel) return;
    if (hintEl) hintEl.textContent = DEFAULT_HINT;
    panel.classList.remove('hidden');
    applyDimUI();
  }

  function closePanel() {
    if (panel) panel.classList.add('hidden');
  }

  if (toggle && panel) {
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('hidden')) openPanel();
      else closePanel();
    });
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('hidden') &&
          !panel.contains(e.target) &&
          !toggle.contains(e.target)) {
        closePanel();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });
  }

  /* 明暗切换后：自动压暗值随主题重算（未手动设置时） */
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      if (state.dim === null) applyDimUI();
    });
  }

  /* ---------- 选择本机图片 ---------- */

  if (pickBtn && fileInput) {
    pickBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      var old = pickBtn.innerHTML;
      pickBtn.disabled = true;
      pickBtn.textContent = '正在处理图片…';
      processImage(file, function (blob) {
        pickBtn.disabled = false;
        pickBtn.innerHTML = old;
        if (!blob) return;
        idbPut(IMG_KEY, blob).then(function () {
          state.mode = 'image';
          state.preset = null;
          saveState();
          applyWallpaper();
          closePanel();
        }).catch(function () { /* 存储失败则忽略 */ });
      });
    });
  }

  /* ---------- 选择本机视频 ---------- */

  if (videoPickBtn) {
    videoPickBtn.addEventListener('click', pickVideo);
  }

  if (videoInput) {
    videoInput.addEventListener('change', function () {
      var file = videoInput.files && videoInput.files[0];
      videoInput.value = '';
      if (!file) return;
      if (!/^video\//.test(file.type)) { setNote('请选择视频文件（mp4 / webm）'); return; }
      // 降级路径：无 File System Access API 时仅本次会话有效
      currentVideoFile = file;
      state.mode = 'video';
      state.preset = null;
      saveState();
      applyWallpaper();
      closePanel();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      function finish() {
        state.mode = 'orb';
        state.preset = null;
        state.dim = null;
        saveState();
        applyWallpaper();
        closePanel();
      }
      Promise.all([idbDel(IMG_KEY), idbDel(VIDEO_KEY)]).then(finish, finish);
    });
  }

  if (dimInput) {
    dimInput.addEventListener('input', function () {
      state.dim = parseInt(dimInput.value, 10);
      if (dimInput.value === '0') state.dim = 0;
      saveState();
      applyDimUI();
    });
  }

  /* ---------- 初始化 ---------- */

  renderOptions();
  syncUI();
  applyWallpaper();
})();
