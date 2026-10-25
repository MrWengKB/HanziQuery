const modal = document.getElementById('charModal');
const modalClose = document.getElementById('modalClose');

// 打开指定 ID 汉字的详情弹窗
function openModal(id) {
  if (!window.DATA) return;
  const item = window.DATA.find(d => d.id === id);
  if (!item) return;

  document.getElementById('modalChar').textContent = item.char;
  document.getElementById('modalPinyin').textContent = item.pinyin_display;
  document.getElementById('modalGrade').textContent = item.grade;
  document.getElementById('modalLesson').textContent = item.lesson;
  document.getElementById('modalStruct').textContent = item.structure;
  document.getElementById('modalRadical').textContent = item.radical + ' 部';
  document.getElementById('modalStrokes').textContent = item.strokes + ' 画';
  document.getElementById('modalInitial').textContent = item.initial_display;
  document.getElementById('modalChar').classList.remove('oracle-mode');
  setOracleToggle(false);
  modal.classList.add('active');
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

// 甲骨文切换
const oracleToggle = document.getElementById('oracleToggle');

function setOracleToggle(on) {
  if (!oracleToggle) return;
  oracleToggle.classList.toggle('active', on);
  oracleToggle.setAttribute('aria-pressed', on);
}

if (oracleToggle) {
  oracleToggle.addEventListener('click', () => {
    const on = document.getElementById('modalChar').classList.toggle('oracle-mode');
    setOracleToggle(on);
  });
}

// 预加载甲骨文字体，避免第一次切换时闪烁
document.fonts?.load('1em FZOracle');
