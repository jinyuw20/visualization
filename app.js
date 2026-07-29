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
  listenCats: null, // null = all categories
};

const WPM = 150;

/* === DOM === */
const $ = id => document.getElementById(id);

/* === Utilities === */
function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function listenMins(text) {
  return Math.ceil(wordCount(text) / WPM);
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/* === Toast === */

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
  $('catFilterChips').innerHTML = cats.map(c => {
    const active = state.listenCats === null || state.listenCats.includes(c);
    return `<button class="cat-chip${active ? ' active' : ''}" onclick="toggleListenCat('${c}')">${c}</button>`;
  }).join('');
}

window.toggleListenCat = function(cat) {
  const cats = [...new Set(window.BLOG_REGISTRY.map(b => b.category))].sort();
  if (state.listenCats === null) {
    // Switch from "all" to all-except-clicked
    state.listenCats = cats.filter(c => c !== cat);
  } else if (state.listenCats.includes(cat)) {
    state.listenCats = state.listenCats.filter(c => c !== cat);
    if (state.listenCats.length === 0) state.listenCats = null; // back to all
  } else {
    state.listenCats = [...state.listenCats, cat];
    if (state.listenCats.length === cats.length) state.listenCats = null; // all selected = null
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
  const pool = state.listenCats
    ? window.BLOG_REGISTRY.filter(b => state.listenCats.includes(b.category))
    : window.BLOG_REGISTRY;
  const shuffled = (pool.length > 0 ? pool : window.BLOG_REGISTRY).slice().sort(() => Math.random() - 0.5);
  const queue = [];
  let total = 0;
  for (const b of shuffled) {
    const wc = wordCount(b.content);
    queue.push({ ...b, wc });
    total += wc;
    if (total >= target) break;
  }
  if (total < target) {
    for (const b of shuffled) {
      if (queue.find(q => q.id === b.id)) continue;
      const wc = wordCount(b.content);
      queue.push({ ...b, wc });
      total += wc;
      if (total >= target) break;
    }
  }
  return { queue, total };
}

/* === Speech === */
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
  window.speechSynthesis.speak(utt);
  return utt;
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

  const text = `${article.title}. By ${article.author}. ${article.content}`;
  speak(text, () => {
    if (state.isPlaying && !state.isPaused) {
      setTimeout(() => playArticle(index + 1), 600);
    }
  });
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
    startProgress(state.queue[state.currentIndex]?.wc || 0);
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
  window.speechSynthesis.cancel();
  state.isPaused = false;
  $('mpPause').textContent = '⏸';
  const next = state.currentIndex + 1;
  if (next >= state.queue.length) {
    finishSession();
  } else {
    setTimeout(() => playArticle(next), 300);
  }
}

function stopSession() {
  state.isPlaying = false;
  state.isPaused = false;
  state.queue = [];
  clearInterval(progressInterval);
  window.speechSynthesis.cancel();
  hideMiniPlayer();
}

function finishSession() {
  clearInterval(progressInterval);
  $('mpBar').style.width = '100%';
  state.isPlaying = false;
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

/* === Blog Feed === */
function renderFeed() {
  let blogs = state.filterCategory === 'All'
    ? window.BLOG_REGISTRY
    : window.BLOG_REGISTRY.filter(b => b.category === state.filterCategory);
  if (state.calDateFilter) {
    blogs = blogs.filter(b => b.date === state.calDateFilter);
  }
  blogs = blogs.slice().sort((a, b) => b.date.localeCompare(a.date));

  $('blogFeed').innerHTML = blogs.map(blog => {
    const date = fmtDate(blog.date);
    const paragraphs = blog.content
      .split(/\n+/)
      .filter(p => p.trim())
      .map(p => `<p>${p.trim()}</p>`)
      .join('');
    return `
      <article class="post-card">
        <div class="post-cat">${blog.category}</div>
        <h2 class="post-title">${blog.title}</h2>
        <div class="post-date">${date}</div>
        <hr class="post-hr">
        <div class="post-body">${paragraphs}</div>
        <div class="post-footer">
          <button class="post-listen-btn" onclick="readArticle('${blog.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            Listen · ~${listenMins(blog.content)} min
          </button>
        </div>
      </article>
    `;
  }).join('');
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
    <span>🎧 ~${listenMins(blog.content)} min</span>
  `;

  const paragraphs = blog.content
    .split(/\n+/)
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join('');
  $('modalContent').innerHTML = paragraphs;

  $('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
};

function closeBlog() {
  $('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

$('modalClose').addEventListener('click', closeBlog);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeBlog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBlog(); });

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
  const filterLabel = calDateFilter ? ` · ${calDateFilter.slice(5).replace('-','/')}` : '';

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
    html += `</div>`;
  }

  $('calendarWidget').innerHTML = html;
}

window.toggleCalendar = function() {
  state.calOpen = !state.calOpen;
  renderCalendar();
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

/* === Init === */
function init() {
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  // Merge localStorage posts
  const custom = JSON.parse(localStorage.getItem('MINICHAT_LOCAL_BLOGS') || '[]');
  custom.forEach(blog => {
    if (!window.BLOG_REGISTRY.find(b => b.id === blog.id)) {
      window.BLOG_REGISTRY.push(blog);
    }
  });

  renderCalendar();
  renderFeed();
  renderSidebar();
}

init();
