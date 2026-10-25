const LONG_PRESS_MS = 400;
const ORACLE_TARGET = '.char-main, .modal-char-big';
let pressTimer = null;
let pressedEl = null;
let suppressClick = false;

// 预加载字体，避免第一次长按时闪一下
document.fonts?.load('1em FZOracle');

document.addEventListener('pointerdown', e => {
  suppressClick = false;
  const el = e.target.closest(ORACLE_TARGET);
  if (!el) return;
  pressedEl = el;
  pressTimer = setTimeout(() => {
    el.classList.add('oracle-mode');
    suppressClick = true; // 长按后松开时不触发打开弹窗
  }, LONG_PRESS_MS);
});

function endPress() {
  clearTimeout(pressTimer);
  pressedEl?.classList.remove('oracle-mode');
  pressedEl = null;
}
document.addEventListener('pointerup', endPress);
document.addEventListener('pointercancel', endPress); // 手指滑动滚屏时也会恢复

// 长按结束后拦截随之而来的 click，避免误开详情弹窗
document.addEventListener('click', e => {
  if (suppressClick) {
    e.stopPropagation();
    e.preventDefault();
    suppressClick = false;
  }
}, true);

// 阻止安卓长按弹出菜单
document.addEventListener('contextmenu', e => {
  if (e.target.closest(ORACLE_TARGET)) e.preventDefault();
});
