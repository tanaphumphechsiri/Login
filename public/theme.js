const themeButton = document.querySelector('#theme-toggle');
const rootElement = document.documentElement;

function setDarkMode(enabled) {
  if (enabled) rootElement.dataset.theme = 'dark';
  else delete rootElement.dataset.theme;

  themeButton.setAttribute('aria-pressed', String(enabled));
  themeButton.setAttribute('aria-label', enabled ? 'ปิดโหมดกลางคืน' : 'เปิดโหมดกลางคืน');
  themeButton.title = enabled ? 'เปลี่ยนเป็นโหมดกลางวัน' : 'เปลี่ยนเป็นโหมดกลางคืน';

  try {
    localStorage.setItem('theme', enabled ? 'dark' : 'light');
  } catch {
    // The theme still works for this page if browser storage is unavailable.
  }
}

let startsDark = false;
try {
  startsDark = localStorage.getItem('theme') === 'dark';
} catch {
  // Use light mode when browser storage is unavailable.
}

setDarkMode(startsDark);
themeButton.addEventListener('click', () => {
  setDarkMode(rootElement.dataset.theme !== 'dark');
});
