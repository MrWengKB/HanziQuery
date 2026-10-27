const modal = document.getElementById('charModal');
// const modalClose = document.getElementById('modalClose');
const modalCharEl = document.getElementById('modalChar');
const modalPinyinEl = document.getElementById('modalPinyin');
const oracleToggle = document.getElementById('oracleToggle');
const modalContent = modal ? modal.querySelector('.modal-content') : null;
const modalCharView = modal ? modal.querySelector('.modal-char-view') : null;

// 当前弹窗里的字（切换甲骨文时要用）
let currentItem = null;
// 当前字在查询结果 window.CURRENT_LIST 中的位置（-1 表示不在列表里）
let currentIndex = -1;

// ---------- 点拼音发音 ----------
// 音频文件放在 audio/ 目录，按「无调拼音 + 声调数字」命名，如 audio/chang2.mp3、audio/lv4.mp3
const AUDIO_DIR = 'audio/';
const AUDIO_PREFIX = 'cmn-';   // 音频包文件名若有前缀（如 'cmn-'）就填在这里
const AUDIO_EXT = '.mp3';
const NEUTRAL_TONE = 1;    // 轻声的编号：按音频包改成 5 或 0
const TONE_MARKS = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const TONE_BASE  = 'aaaaeeeeiiiioooouuuuvvvv';
// 匹配一个拼音音节（带调号，或末尾带数字声调）
const PINYIN_RE = /[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙ]+[0-5]?/g;

let currentAudio = null;

// cháng → chang2，lǜ → lv4，chang2 → chang2
function pinyinToFile(py) {
  let tone = NEUTRAL_TONE;
  let base = '';
  for (const c of py.normalize('NFC').toLowerCase()) {
    const i = TONE_MARKS.indexOf(c);
    if (i !== -1) { tone = (i % 4) + 1; base += TONE_BASE[i]; }
    else if (/[0-5]/.test(c)) { tone = Number(c); }
    else base += (c === 'ü' ? 'v' : c);
  }
  return AUDIO_PREFIX + base + tone;
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (modalPinyinEl) {
    modalPinyinEl.querySelectorAll('.py-play.playing')
      .forEach(el => el.classList.remove('playing'));
  }
}

function playPinyin(py, el) {
  stopAudio();
  const audio = new Audio(AUDIO_DIR + pinyinToFile(py) + AUDIO_EXT);
  currentAudio = audio;
  el.classList.add('playing');
  const done = () => el.classList.remove('playing');
  audio.addEventListener('ended', done);
  audio.addEventListener('error', () => {
    done();
    el.classList.add('no-audio'); // 找不到音频时变淡，方便排查文件名
  });
  audio.play().catch(done);
}

// 把拼音文字拆成可点击的按钮，分隔符（、/ 空格等）原样保留
function renderPinyin(container, text) {
  container.textContent = '';
  let last = 0;
  for (const m of text.matchAll(PINYIN_RE)) {
    if (m.index > last) container.append(text.slice(last, m.index));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'py-play';
    btn.textContent = m[0];
    btn.setAttribute('aria-label', `朗读 ${m[0]}`);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      playPinyin(m[0], btn);
    });
    container.append(btn);
    last = m.index + m[0].length;
  }
  if (last < text.length) container.append(text.slice(last));
}

// ---------- 上一个 / 下一个：按钮和计数（由脚本生成，不用改 index.html） ----------
const modalCounter = document.createElement('div');
modalCounter.className = 'modal-counter';
modalCounter.setAttribute('aria-live', 'polite');

const modalPrev = document.createElement('button');
modalPrev.type = 'button';
modalPrev.className = 'modal-nav modal-nav-prev';
modalPrev.setAttribute('aria-label', '上一个字');
modalPrev.innerHTML = '&#8249;';

const modalNext = document.createElement('button');
modalNext.type = 'button';
modalNext.className = 'modal-nav modal-nav-next';
modalNext.setAttribute('aria-label', '下一个字');
modalNext.innerHTML = '&#8250;';

if (modalContent) modalContent.appendChild(modalCounter);
if (modalCharView) {
  modalCharView.appendChild(modalPrev);
  modalCharView.appendChild(modalNext);
}
modalPrev.addEventListener('click', () => showNeighbor(-1));
modalNext.addEventListener('click', () => showNeighbor(1));

// 打开指定 ID 汉字的详情弹窗（卡片点击时调用）
function openModal(id) {
  if (!window.DATA) return;
  const list = window.CURRENT_LIST || [];
  const idx = list.findIndex(d => d.id === id);
  if (idx !== -1) {
    showAt(idx);
  } else {
    const item = window.DATA.find(d => d.id === id);
    if (!item) return;
    currentIndex = -1;
    fillModal(item);
  }
  modal.classList.add('active');
}

// 显示查询结果中第 idx 个字
function showAt(idx) {
  const list = window.CURRENT_LIST || [];
  if (idx < 0 || idx >= list.length) return;
  currentIndex = idx;
  fillModal(list[idx]);
}

// 把字的资料填进弹窗
function fillModal(item) {
  currentItem = item;
  stopAudio(); // 换字时停掉上一个字的读音

  renderPinyin(modalPinyinEl, String(item.pinyin_display || ''));
  document.getElementById('modalGrade').textContent = item.grade;
  document.getElementById('modalLesson').textContent = item.lesson;
  document.getElementById('modalStruct').textContent = item.structure;
  document.getElementById('modalRadical').textContent = item.radical;
  document.getElementById('modalStrokes').textContent = item.strokes;
  document.getElementById('modalInitial').textContent = item.initial_display;

  // 每次打开都先显示楷体；有甲骨文的字才显示切换按钮
  setOracle(false);
  if (oracleToggle) oracleToggle.classList.toggle('is-hidden', !item.oracle);

  updateNav();
}

// 更新「第 3 / 25 个」和左右箭头状态
function updateNav() {
  const total = (window.CURRENT_LIST || []).length;
  const hasNav = currentIndex !== -1 && total > 1;

  modalCounter.textContent = hasNav ? `${currentIndex + 1} / ${total}` : '';
  modalPrev.classList.toggle('is-hidden', !hasNav);
  modalNext.classList.toggle('is-hidden', !hasNav);
  modalPrev.disabled = !hasNav || currentIndex === 0;
  modalNext.disabled = !hasNav || currentIndex === total - 1;
}

// 切换到上一个（step = -1）或下一个（step = 1）字
function showNeighbor(step) {
  if (!modal.classList.contains('active') || currentIndex === -1) return;
  const total = (window.CURRENT_LIST || []).length;
  const target = currentIndex + step;
  if (target < 0 || target >= total) return; // 到头了就不动
  showAt(target);
  playSwap(step);
}

// 切换时的轻微滑入动画
function playSwap(step) {
  if (!modalContent) return;
  modalContent.classList.remove('swap-next', 'swap-prev');
  void modalContent.offsetWidth; // 让动画可以连续重播
  modalContent.classList.add(step > 0 ? 'swap-next' : 'swap-prev');
}

// 切换甲骨文 / 楷体
function setOracle(on) {
  if (!currentItem || !modalCharEl) return;
  modalCharEl.textContent = on ? currentItem.oracle_char : currentItem.char;
  modalCharEl.classList.toggle('oracle-mode', on);
  if (oracleToggle) {
    oracleToggle.classList.toggle('active', on);
    oracleToggle.setAttribute('aria-pressed', on);
  }
}

if (oracleToggle) {
  oracleToggle.addEventListener('click', () => {
    setOracle(!oracleToggle.classList.contains('active'));
  });
}

// 关闭弹窗
function closeModal() {
  stopAudio();
  modal.classList.remove('active');
}

// 绑定弹窗事件
/* if (modalClose) {
  modalClose.addEventListener('click', closeModal);
} */
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // 触屏左右滑：横向移动超过 50px，且明显比纵向多，才算切换
  let startX = 0, startY = 0;
  modal.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  modal.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      showNeighbor(dx < 0 ? 1 : -1); // 左滑 = 下一个，右滑 = 上一个
    }
  });
}

// 键盘：← → 切换，Esc 关闭
document.addEventListener('keydown', e => {
  if (!modal || !modal.classList.contains('active')) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    showNeighbor(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    showNeighbor(1);
  } else if (e.key === 'Escape') {
    closeModal();
  }
});

// 预加载甲骨文字体，避免第一次切换时闪一下
document.fonts?.load('1em FZOracle');
