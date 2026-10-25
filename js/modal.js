const modal = document.getElementById('charModal');
const modalClose = document.getElementById('modalClose');
const modalCharEl = document.getElementById('modalChar');
const oracleToggle = document.getElementById('oracleToggle');

// 当前弹窗里的字（切换甲骨文时要用）
let currentItem = null;

// 打开指定 ID 汉字的详情弹窗
function openModal(id) {
  if (!window.DATA) return;
  const item = window.DATA.find(d => d.id === id);
  if (!item) return;
  currentItem = item;

  document.getElementById('modalPinyin').textContent = item.pinyin_display;
  document.getElementById('modalGrade').textContent = item.grade;
  document.getElementById('modalLesson').textContent = item.lesson;
  document.getElementById('modalStruct').textContent = item.structure;
  document.getElementById('modalRadical').textContent = item.radical + ' 部';
  document.getElementById('modalStrokes').textContent = item.strokes + ' 画';
  document.getElementById('modalInitial').textContent = item.initial_display;

  // 每次打开都先显示楷体；有甲骨文的字才显示切换按钮
  setOracle(false);
  if (oracleToggle) oracleToggle.classList.toggle('is-hidden', !item.oracle);

  modal.classList.add('active');
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
  modal.classList.remove('active');
}

// 绑定弹窗事件
if (modalClose) {
  modalClose.addEventListener('click', closeModal);
}
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// 预加载甲骨文字体，避免第一次切换时闪一下
document.fonts?.load('1em FZOracle');
