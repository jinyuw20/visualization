/* === State === */
const state = {
  selectedDuration: 10,
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isPaused: false,
  totalWords: 0,
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
  if (_fmtDateCache.has(iso)) return _fmtDateCache.get(iso);
  const d = new Date(iso + 'T00:00:00');
  const r = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  _fmtDateCache.set(iso, r);
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
  var url = location.href.split('#')[0] + '#' + id;
  var blog = (window.BLOG_REGISTRY || []).find(function(b) { return b.id === id; });
  if (!blog) { copyFallback(url); showToast('Link copied!'); return; }
  var img = firstImageUrl(blog);
  var desc = blog.excerpt || stripHtml(blog.content || '').slice(0, 160);
  // Use native share sheet when available (mobile)
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
  showToast('Link copied!');
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

$('sidebarSearch').addEventListener('input', function() {
  state.searchQuery = this.value.trim();
  $('sidebarSearchClear').style.display = state.searchQuery ? 'flex' : 'none';
  const label = $('sidebarBrowseLabel');
  if (label) label.textContent = state.searchQuery ? 'Filter by category' : 'Browse';
  renderFeed();
});

$('sidebarSearchClear').addEventListener('click', function() {
  $('sidebarSearch').value = '';
  state.searchQuery = '';
  this.style.display = 'none';
  const label = $('sidebarBrowseLabel');
  if (label) label.textContent = 'Browse';
  $('sidebarSearch').focus();
  renderFeed();
});

function renderSidebar() {
  const cats = ['All', ...new Set(window.BLOG_REGISTRY.map(b => b.category))].sort();
  $('sidebarNav').innerHTML = cats.map(c => `
    <li>
      <button class="${c === state.filterCategory ? 'active' : ''}"
              onclick="filterBy('${c}')">${c === 'All' ? 'All Articles' : c}</button>
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
  const cats = [...new Set(window.BLOG_REGISTRY.map(b => b.category))].sort();
  const allSelected = state.listenCats === null;
  const ctrl = `<button class="cat-chip-ctrl" onclick="toggleAllCats()">${allSelected ? 'Clear all' : 'Select all'}</button>`;
  $('catFilterChips').innerHTML = ctrl + cats.map(c => {
    const active = state.listenCats === null || state.listenCats.includes(c);
    return `<button class="cat-chip${active ? ' active' : ''}" onclick="toggleListenCat('${c}')">${c}</button>`;
  }).join('');
}

window.toggleAllCats = function() {
  state.listenCats = state.listenCats === null ? [] : null;
  renderCatChips();
};

window.toggleListenCat = function(cat) {
  const cats = [...new Set(window.BLOG_REGISTRY.map(b => b.category))].sort();
  if (state.listenCats === null) {
    state.listenCats = cats.filter(c => c !== cat);
  } else if (state.listenCats.includes(cat)) {
    state.listenCats = state.listenCats.filter(c => c !== cat);
  } else {
    state.listenCats = [...state.listenCats, cat];
    if (state.listenCats.length === cats.length) state.listenCats = null;
  }
  renderCatChips();
};

/* === Listen Dialog === */
function openListenDialog() {
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
  const blog = window.BLOG_REGISTRY.find(b => b.id === id);
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

document.querySelectorAll('.time-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.time-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedDuration = parseInt(btn.dataset.min);
  });
});

$('startListenBtn').addEventListener('click', () => {
  closeListenDialog();
  startSession();
});

/* === Queue Builder === */
function buildQueue(minutes) {
  const target = minutes * WPM;
  const eligible = deduped().filter(b => b.autoRead !== false);
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
  const voices = window.speechSynthesis.getVoices();
  const pick = voices.find(v =>
    v.name.includes('Samantha') || v.name.includes('Daniel') ||
    v.name.includes('Google UK') || v.name.includes('Karen') ||
    v.lang === 'en-US' || v.lang.startsWith('en')
  );
  if (pick) utt.voice = pick;
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
    $('mpBar').style.width = Math.min((done / state.totalWords) * 100, 100) + '%';
  }, 500);
}

/* === Playback === */
function playArticle(index) {
  if (index >= state.queue.length) {
    finishSession();
    return;
  }
  state.currentIndex = index;
  const article = state.queue[index];

  $('mpTitle').textContent = article.title;
  updateMiniPlayer();
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
  state.queue = queue;
  state.totalWords = total;
  state.currentIndex = 0;
  state.isPlaying = true;
  state.isPaused = false;

  showMiniPlayer();
  playArticle(0);
}

function pauseSession() {
  if (!state.isPlaying) return;
  if (state.isPaused) {
    state.isPaused = false;
    window.speechSynthesis.resume();
    $('mpPause').textContent = '⏸';
    startProgress((state.queue[state.currentIndex] || {}).wc || 0);
  } else {
    state.isPaused = true;
    window.speechSynthesis.pause();
    clearInterval(progressInterval);
    $('mpPause').textContent = '▶';
  }
}

function skipArticle() {
  if (!state.isPlaying) return;
  clearInterval(progressInterval);
  state.isPlaying = false; // block onend auto-advance while cancelling
  window.speechSynthesis.cancel();
  state.isPaused = false;
  $('mpPause').textContent = '⏸';
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

function stopSession() {
  state.isPlaying = false;
  state.isPaused = false;
  state.queue = [];
  clearInterval(progressInterval);
  window.speechSynthesis.cancel();
  clearSpeechHighlight();
  hideMiniPlayer();
}

function finishSession() {
  clearInterval(progressInterval);
  $('mpBar').style.width = '100%';
  state.isPlaying = false;
  clearSpeechHighlight();
  setTimeout(hideMiniPlayer, 2000);
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
$('mpTitle').addEventListener('click', function() {
  const article = _currentSpeechArticle || (state.queue[state.currentIndex]);
  if (article) openBlog(article.id);
});

/* === Blog Feed === */
const PAGE_SIZE = 10;
let feedBlogs = [];
let feedRendered = 0;
let feedObserver = null;

let _dedupedCache = null;
function deduped() {
  if (_dedupedCache) return _dedupedCache;
  const m = new Map();
  (window.BLOG_REGISTRY || []).forEach(b => m.set(b.id, b));
  _dedupedCache = [...m.values()];
  return _dedupedCache;
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
          Listen · ~${listenMins(blog)} min
        </button>
        <button class="post-share-btn" onclick="shareArticle('${blog.id}')" title="Copy link">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
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
  const blog = window.BLOG_REGISTRY.find(b => b.id === id);
  if (!blog) return;
  state.openBlog = blog;

  $('modalCategory').textContent = blog.category;
  $('modalTitle').textContent = blog.title;
  $('modalByline').innerHTML = `
    <span>By ${blog.author}</span>
    <span>·</span>
    <span>${fmtDate(blog.date)}</span>
    <span>·</span>
    <span>~${listenMins(blog)} min read</span>
  `;

  const listenBtn = $('modalListenBtn');
  if (listenBtn) {
    listenBtn.onclick = () => readArticle(blog.id);
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
  $('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  history.replaceState(null, '', location.pathname + location.search);
  resetOgMeta();
  clearSpeechHighlight();
}

$('modalClose').addEventListener('click', closeBlog);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeBlog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBlog(); });

window.addEventListener('hashchange', function() {
  const id = window.location.hash.slice(1);
  if (!id) { closeBlog(); return; }
  const blog = deduped().find(b => b.id === id);
  if (blog) openBlog(id);
});

/* === Calendar === */
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function articlesDateSet() {
  return new Set(window.BLOG_REGISTRY.map(b => b.date));
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
        Calendar${filterLabel}
      </span>
      <span class="cal-chevron">${calOpen ? '▲' : '▼'}</span>
    </button>
  `;

  if (calOpen) {
    html += `<div class="cal-body">
      <div class="cal-header">
        <button class="cal-nav" onclick="calPrev()">&#8249;</button>
        <span class="cal-month-label">${MONTH_NAMES[calMonth]} ${calYear}</span>
        <button class="cal-nav" onclick="calNext()">&#8250;</button>
      </div>
      <div class="cal-grid">
        <div class="cal-day-label">Su</div>
        <div class="cal-day-label">Mo</div>
        <div class="cal-day-label">Tu</div>
        <div class="cal-day-label">We</div>
        <div class="cal-day-label">Th</div>
        <div class="cal-day-label">Fr</div>
        <div class="cal-day-label">Sa</div>
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
      html += `<button class="cal-clear" onclick="filterByDate(null)">✕ Show all articles</button>`;
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
      html += `<button class="cal-year-btn cal-year-clear" onclick="filterByYear(null)">✕ All years</button>`;
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

/* === Init === */
function init() {
  window.BLOG_REGISTRY = window.BLOG_REGISTRY || [];

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  // Merge localStorage posts
  try {
    const custom = JSON.parse(localStorage.getItem('MINICHAT_LOCAL_BLOGS') || '[]');
    custom.forEach(blog => {
      if (!window.BLOG_REGISTRY.find(b => b.id === blog.id)) {
        window.BLOG_REGISTRY.push(blog);
      }
    });
  } catch (e) {}

  // Pre-compute word counts once so listenMins() never calls stripHtml per render
  deduped().forEach(b => { if (b._wc === undefined) b._wc = wordCount(b.content || ''); });

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
