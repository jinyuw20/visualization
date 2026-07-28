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
let toastTimer;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
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

/* === Listen Dialog === */
function openListenDialog() {
  $('listenOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeListenDialog() {
  $('listenOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

$('speakerBtn').addEventListener('click', openListenDialog);
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
  const shuffled = [...window.BLOG_REGISTRY].sort(() => Math.random() - 0.5);
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
    showToast('⚠️ Speech not supported in this browser');
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
  showToast(`🎧 Starting ${state.selectedDuration}-min session — ${queue.length} article${queue.length > 1 ? 's' : ''}`);
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
    showToast('⏭ Skipped');
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
  showToast('✅ Session complete!');
  setTimeout(hideMiniPlayer, 2000);
}

/* === Mini Player UI === */
function showMiniPlayer() {
  $('miniPlayer').classList.add('active');
  $('mpBar').style.width = '0%';
  $('mpPause').textContent = '⏸';
}

function hideMiniPlayer() {
  $('miniPlayer').classList.remove('active');
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
  const blogs = state.filterCategory === 'All'
    ? window.BLOG_REGISTRY
    : window.BLOG_REGISTRY.filter(b => b.category === state.filterCategory);

  $('blogFeed').innerHTML = blogs.map(blog => {
    const date = fmtDate(blog.date);
    return `
      <article class="post-card" onclick="openBlog('${blog.id}')">
        <div class="post-cat">${blog.category}</div>
        <h2 class="post-title">${blog.title}</h2>
        <div class="post-date">${date}</div>
        <hr class="post-hr">
        <p class="post-excerpt">${blog.excerpt}</p>
        <div class="post-footer">
          <span class="post-more">Read more →</span>
          <span class="post-comments">0 Comments</span>
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

/* === Read single article from modal === */
$('modalListenBtn').addEventListener('click', () => {
  closeBlog();
  const blog = state.openBlog;
  if (!blog) return;
  if (state.isPlaying) stopSession();

  state.queue = [{ ...blog, wc: wordCount(blog.content) }];
  state.totalWords = state.queue[0].wc;
  state.currentIndex = 0;
  state.isPlaying = true;
  state.isPaused = false;

  showMiniPlayer();
  $('mpTitle').textContent = blog.title;
  showToast(`🎧 Reading: ${blog.title}`);
  playArticle(0);
});

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

  renderFeed();
  renderSidebar();
}

init();
