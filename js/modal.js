const modal = document.getElementById('charModal');
const modalClose = document.getElementById('modalClose');

// 打开指定 ID 汉字的详情弹窗
function openModal(id) {
  if (!window.DATA) return;
  const item = window.DATA.find(d => d.id === id);
  if (!item) return;

  document.getElementById('modalChar').textContent = item.char;
  document.getElementById('modalPinyin').textContent = item.pinyin_display;
  document.getElementById('modalId').textContent = '#' + item.id;
  document.getElementById('modalGrade').textContent = item.grade;
  document.getElementById('modalLesson').textContent = item.lesson;
  document.getElementById('modalStruct').textContent = item.structure;
  document.getElementById('modalRadical').textContent = item.radical + ' 部';
  document.getElementById('modalStrokes').textContent = item.strokes + ' 画';
  document.getElementById('modalInitial').textContent = item.initial_display;
  
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