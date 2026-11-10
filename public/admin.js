const adminName = document.querySelector('#admin-name');
const adminEmail = document.querySelector('#admin-email');
const userCount = document.querySelector('#user-count');
const usersList = document.querySelector('#users-list');
const usersMessage = document.querySelector('#users-message');
const logoutButton = document.querySelector('#logout');
const deletedCount = document.querySelector('#deleted-count');
const deletedList = document.querySelector('#deleted-list');
const deletedMessage = document.querySelector('#deleted-message');
let currentAdmin = null;

async function loadAdmin() {
  const response = await fetch('/api/me');
  if (!response.ok) {
    window.location.replace('/');
    return false;
  }

  const { user } = await response.json();
  if (user.role !== 'admin') {
    window.location.replace('/');
    return false;
  }

  currentAdmin = user;
  adminName.textContent = user.displayName || user.email;
  adminEmail.textContent = user.email;
  return true;
}

function createUserRow(user) {
  const row = document.createElement('li');
  row.className = 'user-row';

  const details = document.createElement('div');
  details.className = 'user-details';

  const name = document.createElement('strong');
  name.textContent = user.displayName || 'ไม่มีชื่อแสดง';

  const email = document.createElement('span');
  email.textContent = user.email;
  const role = document.createElement('span');
  role.className = `user-role ${user.role === 'admin' ? 'admin' : ''}`;
  role.textContent = user.role === 'admin' ? 'ADMIN' : 'USER';
  details.append(name, email, role);

  const actions = document.createElement('div');
  actions.className = 'user-actions';

  if (user.role === 'user') {
    const editPanel = document.createElement('details');
    editPanel.className = 'edit-panel';

    const editSummary = document.createElement('summary');
    editSummary.textContent = 'แก้ไขข้อมูล';

    const editForm = document.createElement('form');
    editForm.className = 'user-edit-form';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'ชื่อที่แสดง';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 100;
    nameInput.value = user.displayName || '';
    nameInput.autocomplete = 'off';
    nameLabel.append(nameInput);

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'รหัสผ่านใหม่';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.minLength = 8;
    passwordInput.maxLength = 128;
    passwordInput.autocomplete = 'new-password';
    passwordInput.placeholder = 'เว้นว่างถ้าไม่เปลี่ยนรหัสผ่าน';
    passwordLabel.append(passwordInput);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'save-user';
    saveButton.textContent = 'บันทึก';

    editForm.append(nameLabel, passwordLabel, saveButton);
    editForm.addEventListener('submit', (event) => {
      updateUser(event, user, nameInput, passwordInput, saveButton);
    });
    editPanel.append(editSummary, editForm);

    const promoteButton = document.createElement('button');
    promoteButton.type = 'button';
    promoteButton.className = 'promote-user';
    promoteButton.textContent = 'ตั้งเป็น admin';
    promoteButton.setAttribute('aria-label', `ตั้ง ${user.email} เป็น admin`);
    promoteButton.addEventListener('click', () => setUserRole(user, 'admin', promoteButton));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-user';
    deleteButton.textContent = 'ลบบัญชี';
    deleteButton.setAttribute('aria-label', `ลบบัญชี ${user.email}`);
    deleteButton.addEventListener('click', () => deleteUser(user, deleteButton));

    actions.append(editPanel, promoteButton, deleteButton);
  } else if (String(user.adminGrantedBy) === String(currentAdmin.id)) {
    const demoteButton = document.createElement('button');
    demoteButton.type = 'button';
    demoteButton.className = 'demote-user';
    demoteButton.textContent = 'คืนเป็น user';
    demoteButton.setAttribute('aria-label', `คืน ${user.email} เป็น user`);
    demoteButton.addEventListener('click', () => setUserRole(user, 'user', demoteButton));
    actions.append(demoteButton);
  } else {
    const source = document.createElement('span');
    source.className = 'admin-source';
    source.textContent = user.adminGrantedBy
      ? `ให้สิทธิ์โดย ${user.grantorDisplayName || user.grantorEmail || 'admin คนอื่น'}`
      : 'admin ต้นทาง';
    actions.append(source);
  }

  row.append(details, actions);
  return row;
}

async function updateUser(event, user, nameInput, passwordInput, button) {
  event.preventDefault();
  const payload = { displayName: nameInput.value };
  if (passwordInput.value) payload.password = passwordInput.value;

  button.disabled = true;
  usersMessage.textContent = '';

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.location.replace('/');
      return;
    }
    if (!response.ok) throw new Error(data.error || 'แก้ไขบัญชีไม่สำเร็จ');

    passwordInput.value = '';
    await loadUsers();
    usersMessage.textContent = data.passwordChanged
      ? 'บันทึกข้อมูลแล้ว และผู้ใช้ต้องเข้าสู่ระบบใหม่'
      : 'บันทึกข้อมูลแล้ว';
  } catch (error) {
    usersMessage.textContent = error.message;
    button.disabled = false;
  }
}

async function setUserRole(user, role, button) {
  const isPromoting = role === 'admin';
  const prompt = isPromoting
    ? `ต้องการตั้ง ${user.email} เป็น admin ใช่หรือไม่?`
    : `ต้องการคืน ${user.email} เป็น user ใช่หรือไม่?`;
  if (!window.confirm(prompt)) return;

  button.disabled = true;
  usersMessage.textContent = '';

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    const data = await response.json();

    if (response.status === 401) {
      window.location.replace('/');
      return;
    }
    if (!response.ok) throw new Error(data.error || 'เปลี่ยน role ไม่สำเร็จ');

    await loadUsers();
    usersMessage.textContent = isPromoting
      ? 'ตั้ง role เป็น admin แล้ว ผู้ใช้นั้นต้องเข้าสู่ระบบใหม่'
      : 'คืน role เป็น user แล้ว';
  } catch (error) {
    usersMessage.textContent = error.message;
    button.disabled = false;
  }
}

async function loadUsers() {
  usersMessage.textContent = 'กำลังโหลดรายชื่อ...';
  usersList.replaceChildren();

  const response = await fetch('/api/admin/users');
  const data = await response.json();
  if (response.status === 401 || response.status === 403) {
    window.location.replace('/');
    return;
  }
  if (!response.ok) throw new Error(data.error || 'โหลดรายชื่อไม่สำเร็จ');

  userCount.textContent = `${data.users.length} บัญชี`;
  if (data.users.length === 0) {
    usersMessage.textContent = 'ยังไม่มีบัญชีในระบบ';
    return;
  }

  usersMessage.textContent = '';
  usersList.replaceChildren(...data.users.map(createUserRow));
}

async function deleteUser(user, button) {
  if (!window.confirm(`ย้ายบัญชี ${user.email} ไปยังรายการบัญชีที่ลบแล้ว? กู้คืนได้ภายใน 30 วัน`)) return;

  button.disabled = true;
  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE'
    });
    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.location.replace('/');
      return;
    }
    if (!response.ok) throw new Error(data.error || 'ลบบัญชีไม่สำเร็จ');

    await loadUsers();
    await loadDeletedUsers();
    usersMessage.textContent = 'ย้ายบัญชีไปยังรายการที่ลบแล้ว กู้คืนได้ภายใน 30 วัน';
  } catch (error) {
    usersMessage.textContent = error.message;
    button.disabled = false;
  }
}

function createDeletedRow(user) {
  const row = document.createElement('li');
  row.className = 'user-row deleted-row';
  const details = document.createElement('div');
  details.className = 'user-details';
  const name = document.createElement('strong');
  name.textContent = user.displayName || 'ไม่มีชื่อแสดง';
  const email = document.createElement('span');
  email.textContent = user.email;
  const deletedAt = document.createElement('span');
  deletedAt.textContent = `ลบเมื่อ ${new Date(user.deletedAt).toLocaleString('th-TH')}`;
  const deletedBy = document.createElement('span');
  deletedBy.textContent = `ดำเนินการโดย ${user.deletedByName || user.deletedByEmail || 'ผู้ดูแลระบบ'}`;
  details.append(name, email, deletedAt, deletedBy);

  const panel = document.createElement('details');
  panel.className = 'restore-panel';
  const summary = document.createElement('summary');
  summary.textContent = 'แก้ข้อมูลและกู้คืน';
  const form = document.createElement('form');
  form.className = 'restore-form';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'ชื่อที่แสดง';
  const nameInput = document.createElement('input');
  nameInput.value = user.displayName || '';
  nameInput.maxLength = 100;
  nameLabel.append(nameInput);
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.minLength = 8;
  passwordInput.maxLength = 128;
  passwordInput.autocomplete = 'new-password';
  passwordLabel.append(passwordInput);
  const restoreButton = document.createElement('button');
  restoreButton.type = 'submit';
  restoreButton.className = 'restore-user';
  restoreButton.textContent = 'กู้คืนบัญชี';
  form.append(nameLabel, passwordLabel, restoreButton);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    restoreButton.disabled = true;
    const payload = { displayName: nameInput.value };
    if (passwordInput.value) payload.password = passwordInput.value;
    try {
      const response = await fetch(`/api/admin/deleted-users/${encodeURIComponent(user.id)}/restore`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) return window.location.replace('/');
      if (!response.ok) throw new Error(data.error || 'กู้คืนบัญชีไม่สำเร็จ');
      await Promise.all([loadUsers(), loadDeletedUsers()]);
      usersMessage.textContent = `กู้คืนบัญชี ${user.email} แล้ว`;
    } catch (error) {
      deletedMessage.textContent = error.message;
      restoreButton.disabled = false;
    }
  });
  panel.append(summary, form);
  row.append(details, panel);
  return row;
}

async function loadDeletedUsers() {
  deletedMessage.textContent = 'กำลังโหลดรายการ...';
  deletedList.replaceChildren();
  const response = await fetch('/api/admin/deleted-users');
  const data = await response.json();
  if (response.status === 401 || response.status === 403) return window.location.replace('/');
  if (!response.ok) throw new Error(data.error || 'โหลดบัญชีที่ลบแล้วไม่สำเร็จ');
  deletedCount.textContent = `${data.users.length} บัญชี`;
  if (!data.users.length) {
    deletedMessage.textContent = 'ไม่มีบัญชีที่รอกู้คืน';
    return;
  }
  deletedMessage.textContent = '';
  deletedList.replaceChildren(...data.users.map(createDeletedRow));
}

logoutButton.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.replace('/');
});

loadAdmin()
  .then((isAdmin) => isAdmin && Promise.all([loadUsers(), loadDeletedUsers()]))
  .catch((error) => {
    usersMessage.textContent = error.message;
  });
