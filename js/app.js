// 全局数据源
window.DATA = [];

// DOM 元素引用
const searchInput = document.getElementById('searchInput');
const gradeFilter = document.getElementById('gradeFilter');
const lessonFilter = document.getElementById('lessonFilter');
const structFilter = document.getElementById('structFilter');
const initialFilter = document.getElementById('initialFilter');
const radicalFilter = document.getElementById('radicalFilter');
const strokeFilter = document.getElementById('strokeFilter');
const resetBtn = document.getElementById('resetBtn');
const charGrid = document.getElementById('charGrid');
const matchCount = document.getElementById('matchCount');
const totalCount = document.getElementById('totalCount');
const noticeBar = document.getElementById('noticeBar');

// 下拉框渲染辅助函数
function populateSelect(selectEl, values, defaultLabel, formatter = v => v) {
  selectEl.innerHTML = `<option value="">${defaultLabel}</option>`;
  values.forEach(val => {
    if (val === undefined || val === null || val === '') return;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = formatter(val);
    selectEl.appendChild(opt);
  });
}

// 初始化下拉筛选菜单选项
function initFilters() {
  totalCount.textContent = window.DATA.length;

  const grades = [...new Set(window.DATA.map(d => d.grade).filter(Boolean))].sort();
  populateSelect(gradeFilter, grades, '全部年级');

  const lessons = [...new Set(window.DATA.map(d => d.lesson).filter(Boolean))].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
  });
  populateSelect(lessonFilter, lessons, '全部课次');

  const structs = [...new Set(window.DATA.map(d => d.structure).filter(Boolean))].sort();
  populateSelect(structFilter, structs, '全部结构');

  const allInitials = new Set();
  window.DATA.forEach(d => {
    d.initials.forEach(init => allInitials.add(init));
  });
  const initials = [...allInitials].sort();
  populateSelect(initialFilter, initials, '全部首字母 (A-Z)');

  const radicals = [...new Set(window.DATA.map(d => d.radical).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
  populateSelect(radicalFilter, radicals, '全部部首');

  const strokes = [...new Set(window.DATA.map(d => d.strokes).filter(Boolean))].sort((a, b) => a - b);
  populateSelect(strokeFilter, strokes, '全部笔画', s => s + ' 画');
}

// 核心渲染：根据当前输入与筛选过滤汉字
function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const grade = gradeFilter.value;
  const lesson = lessonFilter.value;
  const struct = structFilter.value;
  const initial = initialFilter.value;
  const radical = radicalFilter.value;
  const stroke = strokeFilter.value;

  const filtered = window.DATA.filter(item => {
    if (query) {
      const matchChar = item.char.includes(query);
      const matchPy = item.pinyins.some(p => p.toLowerCase().includes(query));
      const matchPlain = item.pinyin_plains.some(p => p.includes(query));
      if (!matchChar && !matchPy && !matchPlain) return false;
    }
    if (grade && item.grade !== grade) return false;
    if (lesson && item.lesson !== lesson) return false;
    if (struct && item.structure !== struct) return false;
    if (initial && !item.initials.includes(initial)) return false;
    if (radical && item.radical !== radical) return false;
    if (stroke && item.strokes !== parseInt(stroke, 10)) return false;
    return true;
  });

  matchCount.textContent = filtered.length;

  if (filtered.length === 0) {
    charGrid.innerHTML = '<div class="empty-state">没有找到符合条件的汉字，请尝试更换或清空筛选条件。</div>';
    return;
  }

  charGrid.innerHTML = filtered.map(item => `
    <div class="char-card" onclick="openModal(${item.id})">
      <div class="card-top">
        <span class="char-id">#${item.id}</span>
        <span class="char-grade-badge">${item.grade}</span>
      </div>
      <div class="char-py">${item.pinyin_display}</div>
      <div class="char-main">${item.char}</div>
      <div class="char-tags">
        <span class="badge badge-primary">${item.structure}</span>
        <span class="badge">${item.radical}部</span>
        <span class="badge">${item.strokes}画</span>
      </div>
    </div>
  `).join('');
}

// 监听各输入项变更
[searchInput, gradeFilter, lessonFilter, structFilter, initialFilter, radicalFilter, strokeFilter].forEach(el => {
  if (el) {
    el.addEventListener('input', renderList);
    el.addEventListener('change', renderList);
  }
});

// 重置按钮
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    gradeFilter.value = '';
    lessonFilter.value = '';
    structFilter.value = '';
    initialFilter.value = '';
    radicalFilter.value = '';
    strokeFilter.value = '';
    renderList();
  });
}

// 手动本地文件读取（绕过某些浏览器直接双击打开的跨域安全限制）
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    window.DATA = parseCSV(evt.target.result);
    initFilters();
    renderList();
    noticeBar.style.display = 'none';
  };
  reader.readAsText(file, 'utf-8');
}

// 默认 fetch 自动加载
fetch('hanzilist.csv')
  .then(res => {
    if (!res.ok) throw new Error('网络响应异常');
    return res.text();
  })
  .then(text => {
    window.DATA = parseCSV(text);
    initFilters();
    renderList();
  })
  .catch(err => {
    console.warn('自动读取 hanzilist.csv 失败（常见于直接双击 HTML 受本地安全跨域限制）:', err);
    if (noticeBar) noticeBar.classList.add('active');
  });