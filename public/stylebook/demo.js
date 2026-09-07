// Local examples only; no network writes.
const status = document.getElementById('action-status');
document.querySelectorAll('[data-notice]').forEach(button => {
  button.addEventListener('click', () => { status.textContent = button.dataset.notice; });
});
const form = document.getElementById('demo-form');
const formStatus = document.getElementById('form-status');
form.addEventListener('submit', event => {
  event.preventDefault();
  formStatus.textContent = '驗證完成：這是本機示例，沒有傳送資料。';
});
form.addEventListener('reset', () => { formStatus.textContent = '尚未驗證。'; });
const dialog = document.getElementById('demo-dialog');
document.getElementById('open-dialog').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', () => {
  status.textContent = dialog.returnValue === 'confirm' ? '已確認示例，沒有傳送資料。' : '已取消示例。';
});
