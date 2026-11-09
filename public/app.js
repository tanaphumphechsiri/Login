const elements = {
  form: document.querySelector('#auth-form'),
  loginTab: document.querySelector('#login-tab'),
  registerTab: document.querySelector('#register-tab'),
  displayName: document.querySelector('#displayName'),
  nameLabel: document.querySelector('#name-label'),
  password: document.querySelector('#password'),
  submit: document.querySelector('#submit'),
  message: document.querySelector('#message'),
  authPanel: document.querySelector('#auth-panel'),
  accountPanel: document.querySelector('#account-panel'),
  heading: document.querySelector('#heading'),
  subheading: document.querySelector('#subheading'),
  accountName: document.querySelector('#account-name'),
  accountEmail: document.querySelector('#account-email'),
  accountRole: document.querySelector('#account-role'),
  logout: document.querySelector('#logout')
};

let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const isRegistering = mode === 'register';

  elements.loginTab.classList.toggle('active', !isRegistering);
  elements.registerTab.classList.toggle('active', isRegistering);
  elements.nameLabel.hidden = !isRegistering;
  elements.displayName.hidden = !isRegistering;
  elements.displayName.required = isRegistering;
  elements.password.autocomplete = isRegistering ? 'new-password' : 'current-password';
  elements.heading.textContent = isRegistering ? 'สร้างบัญชีใหม่' : 'ยินดีต้อนรับ';
  elements.subheading.textContent = isRegistering
    ? 'ใช้เวลาเพียงครู่เดียวในการเริ่มต้น'
    : 'เข้าสู่ระบบเพื่อดำเนินการต่อ';
  elements.submit.textContent = isRegistering ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
  elements.message.textContent = '';
}

function showAccount(user) {
  elements.authPanel.hidden = true;
  elements.accountPanel.hidden = false;
  elements.heading.textContent = 'คุณเข้าสู่ระบบแล้ว';
  elements.subheading.textContent = 'ยินดีที่ได้พบคุณอีกครั้ง';
  elements.accountName.textContent = user.displayName || user.email;
  if (elements.accountEmail) elements.accountEmail.textContent = user.email;
  elements.accountRole.textContent = user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน';
  elements.accountRole.classList.toggle('admin', user.role === 'admin');
}

function showLoginForm() {
  elements.accountPanel.hidden = true;
  elements.authPanel.hidden = false;
  elements.form.reset();
  setMode('login');
}

async function request(url, options = {}) {
  const headers = { ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'ทำรายการไม่สำเร็จ');
  return data;
}

elements.loginTab.addEventListener('click', () => setMode('login'));
elements.registerTab.addEventListener('click', () => setMode('register'));

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.message.textContent = '';
  elements.submit.disabled = true;

  const payload = {
    email: elements.form.elements.email.value,
    password: elements.password.value
  };
  if (mode === 'register') payload.displayName = elements.displayName.value;

  try {
    const { user } = await request(`/api/${mode}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showAccount(user);
  } catch (error) {
    elements.message.textContent = error.message;
  } finally {
    elements.submit.disabled = false;
  }
});

elements.logout.addEventListener('click', async () => {
  try {
    await request('/api/logout', { method: 'POST' });
    showLoginForm();
  } catch (error) {
    if (elements.accountEmail) elements.accountEmail.textContent = error.message;
  }
});

request('/api/me')
  .then(({ user }) => showAccount(user))
  .catch(() => {});
