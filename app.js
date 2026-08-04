/* === State === */
const state = {
  selectedDuration: 10,
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isPaused: false,
  isSession: false, // true when multi-article timed session (vs single readArticle)
  totalWords: 0,
  lang: 'en',
  listenLang: 'en', // 'en' | 'zh' | 'mix'
  filterCategory: 'All',
  openBlog: null,
  calOpen: false,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calDateFilter: null,
  calYearFilter: null,
  searchQuery: '',
  listenCats: null, // null = all categories
};

const WPM = 150;

/* === i18n === */
const STRINGS = {
  en: {
    searchPlaceholder: 'Search articles…',
    browseLbl: 'Browse',
    filterLbl: 'Filter by category',
    allArticles: 'All Articles',
    shareBtnText: 'Share',
    calendarLbl: 'Calendar',
    calDays: ['Su','Mo','Tu','We','Th','Fr','Sa'],
    calMonths: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    calShowAll: '✕ Show all articles',
    allYears: '✕ All years',
    listenTitle: 'Listen Mode',
    listenSubtitle: 'Pick categories and duration for your session.',
    catsLbl: 'Categories',
    durLbl: 'Session length',
    minFmt: n => `${n} min`,
    startBtn: '▶ Start Listening',
    cancelBtn: 'Cancel',
    modalListenBtn: 'Listen',
    byline: (author, date, mins) =>
      `<span>By ${escHtml(author)}</span><span>·</span><span>${date}</span><span>·</span><span>~${mins} min read</span>`,
    listenCardBtn: mins => `Listen · ~${mins} min`,
    nowReading: '🎧 Now Reading',
    skipBtn: '⏭ Skip',
    stopBtn: '■ Stop',
    sbNext: '⏭ Next',
    sbStop: '■ Stop',
    sbTrack: (i, n) => `Article ${i} of ${n}`,
    linkCopied: 'Link copied!',
    clearAll: 'Clear all',
    selectAll: 'Select all',
    contentLbl: 'Reading Language',
    langOptEn: 'English',
    langOptZh: 'Chinese',
    langOptMix: 'Mix',
  },
  zh: {
    searchPlaceholder: '搜索文章…',
    browseLbl: '浏览',
    filterLbl: '按分类筛选',
    allArticles: '所有文章',
    shareBtnText: '分享',
    calendarLbl: '日历',
    calDays: ['日','一','二','三','四','五','六'],
    calMonths: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
    calShowAll: '✕ 显示所有文章',
    allYears: '✕ 所有年份',
    listenTitle: '收听模式',
    listenSubtitle: '选择分类和时长，开始您的收听。',
    catsLbl: '分类',
    durLbl: '时长',
    minFmt: n => `${n}分钟`,
    startBtn: '▶ 开始收听',
    cancelBtn: '取消',
    modalListenBtn: '收听',
    byline: (author, date, mins) =>
      `<span>作者：${escHtml(author)}</span><span>·</span><span>${date}</span><span>·</span><span>约${mins}分钟</span>`,
    listenCardBtn: mins => `收听 · 约${mins}分钟`,
    nowReading: '🎧 正在收听',
    skipBtn: '⏭ 跳过',
    stopBtn: '■ 停止',
    sbNext: '⏭ 下一篇',
    sbStop: '■ 停止',
    sbTrack: (i, n) => `第${i}篇 / 共${n}篇`,
    linkCopied: '链接已复制！',
    clearAll: '取消全选',
    selectAll: '全选',
    contentLbl: '收听语言',
    langOptEn: '英文',
    langOptZh: '中文',
    langOptMix: '中英混合',
  },
};

function t(key, ...args) {
  const val = STRINGS[state.lang][key];
  return typeof val === 'function' ? val(...args) : val;
}

function activeRegistry() {
  return state.lang === 'zh'
    ? (window.BLOG_REGISTRY_ZH || [])
    : (window.BLOG_REGISTRY || []);
}

// Returns the pool of blogs to draw the listen queue from, based on state.listenLang
function listenPool() {
  if (state.listenLang === 'mix') {
    // Combine both registries; each language has its own IDs so no collision expected
    return [
      ...new Map((window.BLOG_REGISTRY || []).map(b => [b.id, b])).values(),
      ...new Map((window.BLOG_REGISTRY_ZH || []).map(b => [b.id, b])).values(),
    ];
  }
  if (state.listenLang === 'zh') {
    return [...new Map((window.BLOG_REGISTRY_ZH || []).map(b => [b.id, b])).values()];
  }
  return [...new Map((window.BLOG_REGISTRY || []).map(b => [b.id, b])).values()];
}

/* === DOM === */
const $ = id => document.getElementById(id);

/* === Utilities === */
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlightStr(str, query) {
  if (!query) return escHtml(str);
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(str).replace(new RegExp('(' + esc + ')', 'gi'), '<mark class="search-hl">$1</mark>');
}

function searchSnippet(blog, query) {
  const plain = stripHtml(blog.content || '');
  const lower = plain.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 80);
  const end = Math.min(plain.length, idx + query.length + 80);
  const raw = (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
  return highlightStr(raw, query);
}

function wordCount(content) {
  const plain = stripHtml(content).trim();
  return plain ? plain.split(/\s+/).length : 0;
}

function listenMins(blog) {
  return Math.ceil((blog._wc !== undefined ? blog._wc : wordCount(blog.content || '')) / WPM);
}

function contentToHtml(blog) {
  if (blog.contentType === 'html') {
    return blog.content
      .replace(/&nbsp;/g, ' ')
      .replace(/<img(?![^>]*\bloading=)/g, '<img loading="lazy"');
  }
  return blog.content.split(/\n+/).filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('');
}

const _fmtDateCache = new Map();
function fmtDate(iso) {
  const key = iso + ':' + state.lang;
  if (_fmtDateCache.has(key)) return _fmtDateCache.get(key);
  const d = new Date(iso + 'T00:00:00');
  const r = state.lang === 'zh'
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  _fmtDateCache.set(key, r);
  return r;
}

/* === Toast === */
function showToast(msg) {
  var t = document.getElementById('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 2000);
}

/* === Image extraction === */
function firstImageUrl(blog) {
  if (!blog.content) return '';
  const m = blog.content.match(/<img[^>]+src="([^"]+)"/);
  if (!m) return '';
  const src = m[1];
  // Make absolute: if already absolute leave it, otherwise resolve from page origin
  if (/^https?:\/\//.test(src)) return src;
  const base = location.href.split('#')[0].replace(/[^/]+$/, '');
  return base + src;
}

/* === Open Graph meta update === */
function updateOgMeta(blog, url) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
  const img = firstImageUrl(blog);
  const desc = blog.excerpt || stripHtml(blog.content || '').slice(0, 160);
  set('ogTitle', blog.title);       set('twTitle', blog.title);
  set('ogDescription', desc);       set('twDescription', desc);
  set('ogUrl', url);
  set('ogImage', img);              set('twImage', img);
  document.title = blog.title + ' — Sukee Tea Time';
}

function resetOgMeta() {
  const def = 'Sukee Tea Time';
  const desc = 'Reflections on life, wellness, and everyday moments.';
  ['ogTitle','twTitle'].forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('content', def); });
  ['ogDescription','twDescription'].forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('content', desc); });
  ['ogImage','twImage'].forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('content', ''); });
  document.title = def;
}

/* === Share === */
window.shareArticle = function(id) {
  var langParam = state.lang === 'zh' ? '?lang=zh' : '';
  var url = location.origin + location.pathname + langParam + '#' + id;
  var blog = activeRegistry().find(function(b) { return b.id === id; });
  if (!blog) { copyFallback(url); showToast(t('linkCopied')); return; }
  var img = firstImageUrl(blog);
  var desc = blog.excerpt || stripHtml(blog.content || '').slice(0, 160);
  if (navigator.share) {
    navigator.share({ title: blog.title, text: desc, url: url }).catch(function() {});
    return;
  }
  var text = blog.title + '\n' + url;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(function() { copyFallback(text); });
  } else {
    copyFallback(text);
  }
  showToast(t('linkCopied'));
};
function copyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}

/* === Sidebar === */
function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebarBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebarBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}

$('hamburgerBtn').addEventListener('click', openSidebar);
$('sidebarClose').addEventListener('click', closeSidebar);
$('sidebarBackdrop').addEventListener('click', closeSidebar);

$('mainSearch').addEventListener('input', function() {
  state.searchQuery = this.value.trim();
  $('mainSearchClear').style.display = state.searchQuery ? 'flex' : 'none';
  const label = $('sidebarBrowseLabel');
  if (label) label.textContent = state.searchQuery ? t('filterLbl') : t('browseLbl');
  renderFeed();
});

$('mainSearchClear').addEventListener('click', function() {
  $('mainSearch').value = '';
  state.searchQuery = '';
  this.style.display = 'none';
  const label = $('sidebarBrowseLabel');
  if (label) label.textContent = t('browseLbl');
  $('mainSearch').focus();
  renderFeed();
});

function renderSidebar() {
  const cats = ['All', ...new Set(activeRegistry().map(b => b.category))].sort();
  $('sidebarNav').innerHTML = cats.map(c => `
    <li>
      <button class="${c === state.filterCategory ? 'active' : ''}"
              onclick="filterBy('${c}')">${c === 'All' ? t('allArticles') : c}</button>
    </li>
  `).join('');
}

window.filterBy = function(cat) {
  state.filterCategory = cat;
  closeSidebar();
  renderFeed();
  renderSidebar();
};

/* === Category chips for listen dialog === */
function renderCatChips() {
  const cats = [...new Set(listenPool().map(b => b.category))].sort();
  const allSelected = state.listenCats === null;
  const ctrl = `<button class="cat-chip-ctrl" onclick="toggleAllCats()">${allSelected ? t('clearAll') : t('selectAll')}</button>`;
  $('catFilterChips').innerHTML = ctrl + cats.map(c => {
    const active = state.listenCats === null || state.listenCats.includes(c);
    return `<button class="cat-chip${active ? ' active' : ''}" onclick="toggleListenCat('${c}')">${c}</button>`;
  }).join('');
}

function saveCatPref() {
  localStorage.setItem('minichat_listen_cats',
    state.listenCats === null ? 'all' : JSON.stringify(state.listenCats));
}

window.toggleAllCats = function() {
  state.listenCats = state.listenCats === null ? [] : null;
  saveCatPref();
  renderCatChips();
};

window.toggleListenCat = function(cat) {
  const cats = [...new Set(listenPool().map(b => b.category))].sort();
  if (state.listenCats === null) {
    state.listenCats = cats.filter(c => c !== cat);
  } else if (state.listenCats.includes(cat)) {
    state.listenCats = state.listenCats.filter(c => c !== cat);
  } else {
    state.listenCats = [...state.listenCats, cat];
    if (state.listenCats.length === cats.length) state.listenCats = null;
  }
  saveCatPref();
  renderCatChips();
};

function renderListenLangOpts() {
  document.querySelectorAll('#listenLangOpts .time-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === state.listenLang);
    const key = btn.dataset.lang === 'en' ? 'langOptEn'
              : btn.dataset.lang === 'zh' ? 'langOptZh'
              : 'langOptMix';
    btn.textContent = t(key);
  });
}

/* === Listen Dialog === */
function openListenDialog() {
  renderListenLangOpts();
  renderCatChips();
  $('listenOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeListenDialog() {
  $('listenOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

$('speakerBtn').addEventListener('click', openListenDialog);

window.readArticle = function(id) {
  const blog = activeRegistry().find(b => b.id === id);
  if (!blog) return;
  if (state.isPlaying) stopSession();
  state.queue = [{ ...blog, wc: wordCount(blog.content) }];
  state.totalWords = state.queue[0].wc;
  state.currentIndex = 0;
  state.isPlaying = true;
  state.isPaused = false;
  showMiniPlayer();
  $('mpTitle').textContent = blog.title;
  playArticle(0);
};
$('cancelListenBtn').addEventListener('click', closeListenDialog);
$('listenOverlay').addEventListener('click', e => {
  if (e.target === $('listenOverlay')) closeListenDialog();
});

document.querySelectorAll('.time-opt[data-min]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.time-opt[data-min]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedDuration = parseInt(btn.dataset.min);
  });
});

document.querySelectorAll('#listenLangOpts .time-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    state.listenLang = btn.dataset.lang;
    state.listenCats = null; // reset category filter when content language changes
    saveCatPref();
    renderListenLangOpts();
    renderCatChips();
  });
});

$('startListenBtn').addEventListener('click', () => {
  closeListenDialog();
  startSession();
});

/* === Queue Builder === */
function buildQueue(minutes) {
  const target = minutes * WPM;
  const eligible = listenPool().filter(b => b.autoRead !== false);
  const pool = state.listenCats
    ? eligible.filter(b => state.listenCats.includes(b.category))
    : eligible;
  const shuffled = (pool.length > 0 ? pool : eligible).slice().sort(() => Math.random() - 0.5);
  const queue = [];
  let total = 0;
  for (const b of shuffled) {
    const wc = b._wc !== undefined ? b._wc : wordCount(b.content);
    queue.push({ ...b, wc });
    total += wc;
    if (total >= target) break;
  }
  if (total < target) {
    for (const b of shuffled) {
      if (queue.find(q => q.id === b.id)) continue;
      const wc = b._wc !== undefined ? b._wc : wordCount(b.content);
      queue.push({ ...b, wc });
      total += wc;
      if (total >= target) break;
    }
  }
  return { queue, total };
}

/* === Speech === */
let _currentUtt = null;
let _currentSpeechArticle = null;

function speak(text, onEnd) {
  if (!window.speechSynthesis) {
    console.warn('Speech not supported in this browser');
    return null;
  }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.92;
  utt.pitch = 1.0;

  const isChinese = /[一-鿿㐀-䶿]/.test(text);
  const voices = window.speechSynthesis.getVoices();

  if (isChinese) {
    utt.lang = 'zh-CN';
    const pick = voices.find(v => v.lang === 'zh-CN' || v.lang === 'zh-TW' || v.lang.startsWith('zh'))
               || voices.find(v => v.name.toLowerCase().includes('chinese')
                               || v.name.toLowerCase().includes('mandarin')
                               || v.name.includes('Ting-Ting')
                               || v.name.includes('Mei-Jia')
                               || v.name.includes('Sin-Ji'));
    if (pick) utt.voice = pick;
  } else {
    utt.lang = 'en-US';
    const pick = voices.find(v =>
      v.name.includes('Samantha') || v.name.includes('Daniel') ||
      v.name.includes('Google UK') || v.name.includes('Karen') ||
      v.lang === 'en-US' || v.lang.startsWith('en')
    );
    if (pick) utt.voice = pick;
  }

  utt.onend = onEnd;
  utt.onerror = e => { if (e.error !== 'interrupted') onEnd(); };
  _currentUtt = utt;
  window.speechSynthesis.speak(utt);
  return utt;
}

/* === Speech highlighting === */
function clearSpeechHighlight() {
  document.querySelectorAll('#modalContent .speech-active').forEach(el => {
    el.classList.remove('speech-active');
  });
}

function setupSpeechHighlight(article, utt, fullText) {
  const overlay = $('modalOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (!state.openBlog || state.openBlog.id !== article.id) return;

  // Character offset where content begins in the spoken text
  const prefixLen = (article.title + '. By ' + article.author + '. ').length;

  // Build a char-range map for each block element in the modal
  const blocks = document.querySelectorAll('#modalContent p, #modalContent li');
  const ranges = [];
  let pos = prefixLen;
  blocks.forEach(el => {
    const len = (el.textContent || '').length;
    ranges.push({ start: pos, end: pos + len, el });
    pos += len + 1;
  });

  let lastActive = null;
  utt.onboundary = (e) => {
    const ci = e.charIndex;
    for (const r of ranges) {
      if (ci >= r.start && ci < r.end) {
        if (lastActive !== r.el) {
          if (lastActive) lastActive.classList.remove('speech-active');
          r.el.classList.add('speech-active');
          r.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          lastActive = r.el;
        }
        break;
      }
    }
  };
}

/* === Progress === */
let progressInterval = null;
let articleStartTime = null;

function startProgress(articleWc) {
  clearInterval(progressInterval);
  articleStartTime = Date.now();
  const articleSec = (articleWc / WPM) * 60;

  progressInterval = setInterval(() => {
    if (!state.isPlaying || state.isPaused) return;
    const elapsed = (Date.now() - articleStartTime) / 1000;
    const pct = Math.min(elapsed / articleSec, 1);
    const prevWords = state.queue.slice(0, state.currentIndex).reduce((s, q) => s + q.wc, 0);
    const done = prevWords + articleWc * pct;
    const totalPct = Math.min((done / state.totalWords) * 100, 100);
    if (state.isSession) {
      $('sessionBarFill').style.width = totalPct + '%';
    } else {
      $('mpBar').style.width = totalPct + '%';
    }
  }, 500);
}

/* === Session bar UI === */
function showSessionBar() {
  const bar = $('sessionBar');
  if (bar) { bar.style.display = 'block'; }
  $('sessionBarFill').style.width = '0%';
  updateSessionBar();
}

function hideSessionBar() {
  const bar = $('sessionBar');
  if (bar) bar.style.display = 'none';
  $('sessionBarFill').style.width = '0%';
}

function updateSessionBar() {
  $('sessionBarTrack').textContent = t('sbTrack', state.currentIndex + 1, state.queue.length);
  $('sbPause').textContent = state.isPaused ? '▶' : '⏸';
}

/* === Playback === */
function playArticle(index) {
  if (index >= state.queue.length) {
    finishSession();
    return;
  }
  state.currentIndex = index;
  const article = state.queue[index];

  if (state.isSession) {
    // Open (or update) the modal with this article
    openBlog(article.id);
    updateSessionBar();
  } else {
    $('mpTitle').textContent = article.title;
    updateMiniPlayer();
  }
  startProgress(article.wc);

  _currentSpeechArticle = article;
  const text = `${article.title}. By ${article.author}. ${stripHtml(article.content)}`;
  const utt = speak(text, () => {
    _currentUtt = null;
    _currentSpeechArticle = null;
    clearSpeechHighlight();
    if (state.isPlaying && !state.isPaused) {
      setTimeout(() => playArticle(index + 1), 600);
    }
  });
  if (utt) setupSpeechHighlight(article, utt, text);
}

function startSession() {
  if (state.isPlaying) stopSession();
  const { queue, total } = buildQueue(state.selectedDuration);
  if (!queue.length) return;
  state.queue = queue;
  state.totalWords = total;
  state.currentIndex = 0;
  state.isPlaying = true;
  state.isPaused = false;
  state.isSession = true;

  // playArticle will call openBlog to show the modal; show bar first so it's visible when modal opens
  showSessionBar();
  playArticle(0);
}

function pauseSession() {
  if (!state.isPlaying) return;
  if (state.isPaused) {
    state.isPaused = false;
    window.speechSynthesis.resume();
    if (state.isSession) {
      $('sbPause').textContent = '⏸';
    } else {
      $('mpPause').textContent = '⏸';
    }
    startProgress((state.queue[state.currentIndex] || {}).wc || 0);
  } else {
    state.isPaused = true;
    window.speechSynthesis.pause();
    clearInterval(progressInterval);
    if (state.isSession) {
      $('sbPause').textContent = '▶';
    } else {
      $('mpPause').textContent = '▶';
    }
  }
}

function skipArticle() {
  if (!state.isPlaying) return;
  clearInterval(progressInterval);
  state.isPlaying = false; // block onend auto-advance while cancelling
  window.speechSynthesis.cancel();
  state.isPaused = false;
  if (state.isSession) {
    $('sbPause').textContent = '⏸';
  } else {
    $('mpPause').textContent = '⏸';
  }
  const next = state.currentIndex + 1;
  if (next >= state.queue.length) {
    finishSession();
  } else {
    setTimeout(() => {
      state.isPlaying = true;
      playArticle(next);
    }, 300);
  }
}

function _closeModalUI() {
  $('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  if (window.location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  resetOgMeta();
  clearSpeechHighlight();
  state.openBlog = null;
}

function stopSession() {
  const wasSession = state.isSession;
  state.isPlaying = false;
  state.isPaused = false;
  state.isSession = false;
  state.queue = [];
  clearInterval(progressInterval);
  window.speechSynthesis.cancel();
  clearSpeechHighlight();
  if (wasSession) {
    hideSessionBar();
    _closeModalUI();
  } else {
    hideMiniPlayer();
  }
}

function finishSession() {
  clearInterval(progressInterval);
  const wasSession = state.isSession;
  state.isPlaying = false;
  state.isSession = false;
  clearSpeechHighlight();
  if (wasSession) {
    $('sessionBarFill').style.width = '100%';
    setTimeout(() => {
      hideSessionBar();
      _closeModalUI();
    }, 2000);
  } else {
    $('mpBar').style.width = '100%';
    setTimeout(hideMiniPlayer, 2000);
  }
}

/* === Mini Player UI === */
function showMiniPlayer() {
  $('miniPlayer').classList.add('active');
  document.body.classList.add('player-active');
  $('mpBar').style.width = '0%';
  $('mpPause').textContent = '⏸';
}

function hideMiniPlayer() {
  $('miniPlayer').classList.remove('active');
  document.body.classList.remove('player-active');
  $('mpBar').style.width = '0%';
}

function updateMiniPlayer() {
  $('mpPause').textContent = state.isPaused ? '▶' : '⏸';
}

$('mpPause').addEventListener('click', pauseSession);
$('mpSkip').addEventListener('click', skipArticle);
$('mpStop').addEventListener('click', stopSession);
$('sbPause').addEventListener('click', pauseSession);
$('sbSkip').addEventListener('click', skipArticle);
$('sbStop').addEventListener('click', stopSession);
$('mpTitle').addEventListener('click', function() {
  const article = _currentSpeechArticle || (state.queue[state.currentIndex]);
  if (article) openBlog(article.id);
});

/* === Blog Feed === */
const PAGE_SIZE = 10;
let feedBlogs = [];
let feedRendered = 0;
let feedObserver = null;

const _dedupedCaches = { en: null, zh: null };
function deduped() {
  const lang = state.lang;
  if (_dedupedCaches[lang] !== null) return _dedupedCaches[lang];
  const m = new Map();
  activeRegistry().forEach(b => m.set(b.id, b));
  _dedupedCaches[lang] = [...m.values()];
  return _dedupedCaches[lang];
}

function tagPillsHtml(tags, query) {
  if (!tags || !tags.length) return '';
  return '<div class="post-tags">' +
    tags.map(t => '<span class="post-tag">' + (query ? highlightStr(t, query) : escHtml(t)) + '</span>').join('') +
    '</div>';
}

function blogCardHtml(blog) {
  const date = fmtDate(blog.date);
  const q = state.searchQuery;
  const titleHtml = q ? highlightStr(blog.title, q) : escHtml(blog.title);
  let bodyHtml;
  if (q) {
    const snippet = searchSnippet(blog, q);
    bodyHtml = snippet
      ? '<p class="search-snippet">' + snippet + '</p>'
      : '<p class="search-snippet">' + highlightStr((blog.excerpt || stripHtml(blog.content || '').slice(0, 160)), q) + '…</p>';
  } else {
    bodyHtml = contentToHtml(blog);
  }
  return `
    <article class="post-card${blog.pinned ? ' post-card--pinned' : ''}">
      <div class="post-cat-row">
        <span class="post-cat">${escHtml(blog.category)}</span>
        ${blog.pinned ? '<span class="post-pin-badge">📌 Pinned</span>' : ''}
      </div>
      <h2 class="post-title">${titleHtml}</h2>
      <div class="post-date">${date}</div>
      <hr class="post-hr">
      <div class="post-body">${bodyHtml}</div>
      ${tagPillsHtml(blog.tags, q)}
      <div class="post-footer">
        <button class="post-listen-btn" onclick="readArticle('${blog.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          ${t('listenCardBtn', listenMins(blog))}
        </button>
        <button class="post-share-btn" onclick="shareArticle('${blog.id}')" title="Copy link">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          ${t('shareBtnText')}
        </button>
      </div>
    </article>
  `;
}

function appendFeedPage() {
  const batch = feedBlogs.slice(feedRendered, feedRendered + PAGE_SIZE);
  if (!batch.length) return;
  const div = document.createElement('div');
  div.innerHTML = batch.map(blogCardHtml).join('');
  $('blogFeed').appendChild(div);
  feedRendered += batch.length;
  updateSentinel();
}

function updateSentinel() {
  let sentinel = document.getElementById('feedSentinel');
  if (feedRendered >= feedBlogs.length) {
    if (sentinel) sentinel.remove();
    if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
    return;
  }
  // Fallback for browsers without IntersectionObserver (iOS < 12.1)
  if (typeof IntersectionObserver === 'undefined') {
    appendFeedPage(); // just render all remaining
    return;
  }
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'feedSentinel';
    $('blogFeed').insertAdjacentElement('afterend', sentinel);
  }
  if (feedObserver) feedObserver.disconnect();
  feedObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) appendFeedPage();
  }, { rootMargin: '300px' });
  feedObserver.observe(sentinel);
}

function renderFeed() {
  let blogs = state.filterCategory === 'All'
    ? deduped()
    : deduped().filter(b => b.category === state.filterCategory);
  if (state.calYearFilter) {
    blogs = blogs.filter(b => b.date.startsWith(state.calYearFilter));
  }
  if (state.calDateFilter) {
    blogs = blogs.filter(b => b.date === state.calDateFilter);
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    blogs = blogs.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.excerpt || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q) ||
      (b.tags || []).some(t => t.toLowerCase().includes(q)) ||
      stripHtml(b.content || '').toLowerCase().includes(q)
    );
  }
  feedBlogs = blogs.slice().sort((a, b) => {
    if (b.pinned !== a.pinned) return b.pinned ? 1 : -1;
    return b.date.localeCompare(a.date);
  });
  feedRendered = 0;
  $('blogFeed').innerHTML = '';
  appendFeedPage();
}

/* === Article Modal === */
window.openBlog = function(id) {
  const blog = activeRegistry().find(b => b.id === id);
  if (!blog) return;
  state.openBlog = blog;

  $('modalCategory').textContent = blog.category;
  $('modalTitle').textContent = blog.title;
  $('modalByline').innerHTML = t('byline', blog.author, fmtDate(blog.date), listenMins(blog));

  const listenBtn = $('modalListenBtn');
  if (listenBtn) {
    listenBtn.onclick = () => readArticle(blog.id);
    const lbText = $('modalListenBtnText');
    if (lbText) lbText.textContent = t('modalListenBtn');
  }

  $('modalContent').innerHTML = contentToHtml(blog);

  const tagsEl = document.getElementById('modalTags');
  if (tagsEl) tagsEl.innerHTML = tagPillsHtml(blog.tags, '');

  $('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  const shareUrl = location.href.split('#')[0] + '#' + blog.id;
  history.replaceState(null, '', location.pathname + location.search + '#' + blog.id);
  updateOgMeta(blog, shareUrl);

  // If this article is currently being read aloud, activate highlighting in the modal
  if (_currentUtt && _currentSpeechArticle && _currentSpeechArticle.id === blog.id) {
    setupSpeechHighlight(_currentSpeechArticle, _currentUtt, '');
  }
};

function closeBlog() {
  if (state.isPlaying && state.isSession) {
    // Closing the modal during a session stops the session entirely
    state.isPlaying = false;
    state.isSession = false;
    state.isPaused = false;
    state.queue = [];
    clearInterval(progressInterval);
    window.speechSynthesis.cancel();
    hideSessionBar();
  }
  _closeModalUI();
}

$('modalClose').addEventListener('click', closeBlog);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeBlog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBlog(); });

window.addEventListener('hashchange', function() {
  const id = window.location.hash.slice(1);
  if (!id) return; // hash removed by _closeModalUI — modal is already closing
  if (state.openBlog && state.openBlog.id === id) return; // already showing this article
  const blog = deduped().find(b => b.id === id);
  if (blog) openBlog(id);
});

/* === Calendar === */

function articlesDateSet() {
  return new Set(activeRegistry().map(b => b.date));
}

function renderCalendar() {
  const { calYear, calMonth, calDateFilter, calOpen } = state;
  const articleDates = articlesDateSet();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const { calYearFilter } = state;
  const filterLabel = calDateFilter
    ? ` · ${calDateFilter.slice(5).replace('-','/')}`
    : calYearFilter ? ` · ${calYearFilter}` : '';

  let html = `
    <button class="cal-toggle" onclick="toggleCalendar()">
      <span class="cal-toggle-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${t('calendarLbl')}${filterLabel}
      </span>
      <span class="cal-chevron">${calOpen ? '▲' : '▼'}</span>
    </button>
  `;

  if (calOpen) {
    html += `<div class="cal-body">
      <div class="cal-header">
        <button class="cal-nav" onclick="calPrev()">&#8249;</button>
        <span class="cal-month-label">${state.lang === 'zh' ? `${calYear}年${calMonth + 1}月` : `${t('calMonths')[calMonth]} ${calYear}`}</span>
        <button class="cal-nav" onclick="calNext()">&#8250;</button>
      </div>
      <div class="cal-grid">
        ${t('calDays').map(d => `<div class="cal-day-label">${d}</div>`).join('')}
    `;
    for (let i = 0; i < firstWeekday; i++) html += `<div class="cal-cell"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasArt = articleDates.has(ds);
      const isSel = calDateFilter === ds;
      const isToday = ds === todayStr;
      html += `<div class="cal-cell${hasArt ? ' has-article' : ''}${isSel ? ' selected' : ''}${isToday ? ' today' : ''}"
                    ${hasArt ? `onclick="filterByDate('${ds}')"` : ''}>
        <span>${d}</span>${hasArt ? '<span class="cal-dot"></span>' : ''}
      </div>`;
    }
    html += `</div>`;
    if (calDateFilter) {
      html += `<button class="cal-clear" onclick="filterByDate(null)">${t('calShowAll')}</button>`;
    }

    // Year carousel
    const yearMap = new Map();
    deduped().forEach(b => {
      const y = b.date.slice(0, 4);
      yearMap.set(y, (yearMap.get(y) || 0) + 1);
    });
    const years = [...yearMap.keys()].sort((a, b) => b - a);
    html += `<div class="cal-year-carousel" id="calYearCarousel">`;
    if (calYearFilter) {
      html += `<button class="cal-year-btn cal-year-clear" onclick="filterByYear(null)">${t('allYears')}</button>`;
    }
    years.forEach(y => {
      const active = calYearFilter === y ? ' active' : '';
      html += `<button class="cal-year-btn${active}" onclick="filterByYear('${y}')">${y} <span class="cal-year-count">${yearMap.get(y)}</span></button>`;
    });
    html += `</div>`;

    html += `</div>`;
  }

  $('calendarWidget').innerHTML = html;
}

window.toggleCalendar = function() {
  state.calOpen = !state.calOpen;
  renderCalendar();
  if (state.calOpen) requestAnimationFrame(initCarouselDrag);
};

window.calPrev = function() {
  if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; }
  else state.calMonth--;
  renderCalendar();
};
window.calNext = function() {
  if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; }
  else state.calMonth++;
  renderCalendar();
};
window.filterByDate = function(ds) {
  state.calDateFilter = ds;
  renderCalendar();
  renderFeed();
};

window.filterByYear = function(year) {
  state.calYearFilter = year;
  state.calDateFilter = null; // clear day filter when switching years
  if (year) {
    state.calYear = parseInt(year);
    // Jump to first month that has an article in this year, or January
    const months = deduped()
      .filter(b => b.date.startsWith(year))
      .map(b => parseInt(b.date.slice(5, 7)) - 1);
    state.calMonth = months.length ? Math.min(...months) : 0;
  }
  renderCalendar();
  renderFeed();

  // Scroll the active year chip into view after render
  requestAnimationFrame(() => {
    const active = document.querySelector('.cal-year-btn.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    initCarouselDrag();
  });
};

/* === Year carousel drag-to-scroll === */
function initCarouselDrag() {
  const el = document.getElementById('calYearCarousel');
  if (!el) return;
  let startX, startScroll, dragging = false;
  el.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.pageX - el.offsetLeft;
    startScroll = el.scrollLeft;
    el.style.userSelect = 'none';
  });
  el.addEventListener('mouseleave', () => { dragging = false; });
  el.addEventListener('mouseup', () => { dragging = false; el.style.userSelect = ''; });
  el.addEventListener('mousemove', e => {
    if (!dragging) return;
    e.preventDefault();
    el.scrollLeft = startScroll - (e.pageX - el.offsetLeft - startX);
  });
}

/* === Language === */
function applyLang() {
  const lang = state.lang;
  document.body.classList.toggle('lang-zh', lang === 'zh');
  // Toggle button shows what you switch TO
  $('langToggle').textContent = lang === 'zh' ? 'EN' : '中文';
  // Sidebar
  $('mainSearch').placeholder = t('searchPlaceholder');
  const browseLabel = $('sidebarBrowseLabel');
  if (browseLabel) browseLabel.textContent = state.searchQuery ? t('filterLbl') : t('browseLbl');
  // Listen dialog
  $('listenDialogTitle').textContent = t('listenTitle');
  $('listenDialogSubtitle').textContent = t('listenSubtitle');
  $('listenCatLabel').textContent = t('catsLbl');
  $('listenContentLbl').textContent = t('contentLbl');
  $('listenDurLabel').textContent = t('durLbl');
  $('startListenBtn').textContent = t('startBtn');
  $('cancelListenBtn').textContent = t('cancelBtn');
  document.querySelectorAll('.time-opt[data-min]').forEach(btn => {
    btn.textContent = t('minFmt', parseInt(btn.dataset.min));
  });
  renderListenLangOpts();
  // Mini player
  $('mpLabel').textContent = t('nowReading');
  $('mpSkip').textContent = t('skipBtn');
  $('mpStop').textContent = t('stopBtn');
  // Session bar
  $('sbSkip').textContent = t('sbNext');
  $('sbStop').textContent = t('sbStop');
  // Modal listen button text
  const lbText = $('modalListenBtnText');
  if (lbText) lbText.textContent = t('modalListenBtn');
}

function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  state.filterCategory = 'All';
  state.listenCats = null;
  state.calYearFilter = null;
  state.calDateFilter = null;
  // Sync listen language with UI language (unless already on mix)
  if (state.listenLang !== 'mix') state.listenLang = lang;
  // Invalidate per-language caches
  _dedupedCaches.en = null;
  _dedupedCaches.zh = null;
  localStorage.setItem('minichat_lang', lang);
  // Sync URL lang param
  const url = new URL(location.href);
  if (lang === 'zh') url.searchParams.set('lang', 'zh');
  else url.searchParams.delete('lang');
  url.hash = '';
  history.replaceState(null, '', url.toString());
  // Pre-compute word counts for newly active registry
  deduped().forEach(b => { if (b._wc === undefined) b._wc = wordCount(b.content || ''); });
  applyLang();
  renderCalendar();
  renderFeed();
  renderSidebar();
}

$('langToggle').addEventListener('click', () => setLang(state.lang === 'en' ? 'zh' : 'en'));

/* === Init === */
function init() {
  window.BLOG_REGISTRY = window.BLOG_REGISTRY || [];
  window.BLOG_REGISTRY_ZH = window.BLOG_REGISTRY_ZH || [];

  // Detect language from URL param or localStorage, default to 'en'
  const urlLang = new URLSearchParams(location.search).get('lang');
  if (urlLang === 'zh' || urlLang === 'en') {
    state.lang = urlLang;
    localStorage.setItem('minichat_lang', urlLang);
  } else {
    state.lang = localStorage.getItem('minichat_lang') || 'en';
  }
  state.listenLang = state.lang; // default listen language matches UI language

  // Restore saved category preference
  const savedCats = localStorage.getItem('minichat_listen_cats');
  if (savedCats && savedCats !== 'all') {
    try { state.listenCats = JSON.parse(savedCats); } catch (e) {}
  }

  if (window.speechSynthesis) {
    // Pre-load voices; some browsers (Chrome) populate them asynchronously
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
  }

  // Merge localStorage posts (English registry only)
  try {
    const custom = JSON.parse(localStorage.getItem('MINICHAT_LOCAL_BLOGS') || '[]');
    custom.forEach(blog => {
      if (!window.BLOG_REGISTRY.find(b => b.id === blog.id)) {
        window.BLOG_REGISTRY.push(blog);
      }
    });
  } catch (e) {}

  // Pre-compute word counts for active registry
  deduped().forEach(b => { if (b._wc === undefined) b._wc = wordCount(b.content || ''); });

  applyLang();
  renderCalendar();
  renderFeed();
  renderSidebar();

  const hash = window.location.hash.slice(1);
  if (hash) {
    const blog = deduped().find(function(b) { return b.id === hash; });
    if (blog) openBlog(hash);
  }
}

init();
