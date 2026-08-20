/* ═══════════════════════════════════════════════════════════════
   Roblox Alt Generator — app.js
═══════════════════════════════════════════════════════════════ */

// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL = 'https://web-production-3109f.up.railway.app';

// ── State ────────────────────────────────────────────────────────────────────
let accounts    = [];   // { index, username, password, status, created_at, error }
let running     = false;
let taskId      = null;
let eventSource = null;
let proxies     = [];   // manually pasted proxies

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const countInput      = $('count');
const delayInput      = $('delay');
const solverService   = $('solver-service');
const solverKey       = $('solver-key');
const solverStatus    = $('solver-status');
const toggleKeyBtn    = $('toggle-key');
const proxyBadge      = $('proxy-badge');
const proxyPaste      = $('proxy-paste');
const accountsBody    = $('accounts-body');
const emptyState      = $('empty-state');
const countBadge      = $('count-badge');
const statusDot       = $('status-dot');
const statusText      = $('status-text');
const proxyStats      = $('proxy-stats');

const btnGenerate     = $('btn-generate');
const btnStop         = $('btn-stop');
const btnFetchProxies = $('btn-fetch-proxies');
const btnApplyProxies = $('btn-apply-proxies');

const modalOverlay    = $('modal-overlay');
const modalUsername   = $('modal-username');
const modalPassword   = $('modal-password');
const modalStatus     = $('modal-status');
const modalError      = $('modal-error');
const modalErrorWrap  = $('modal-error-wrap');
const modalTime       = $('modal-time');
const btnCopyAll      = $('btn-copy-all');
const modalClose      = $('modal-close');

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  typewriterEffect('Roblox Alt Generator', 'hero-typewriter', 60);
  orbParallax();
  attachListeners();
  updateProxyBadge(0);
});

function attachListeners() {
  btnGenerate.addEventListener('click', generateAccounts);
  btnStop.addEventListener('click', stopGeneration);
  btnFetchProxies.addEventListener('click', fetchProxies);
  btnApplyProxies.addEventListener('click', applyProxies);
  solverKey.addEventListener('input', updateSolverStatus);
  solverService.addEventListener('change', updateSolverStatus);
  toggleKeyBtn.addEventListener('click', toggleKeyVisibility);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

  // Copy buttons in modal
  document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-copy');
      const acct  = getSelectedAccount();
      if (!acct) return;
      const val = field === 'username' ? acct.username : acct.password;
      copyToClipboard(val, btn);
    });
  });

  btnCopyAll.addEventListener('click', () => {
    const acct = getSelectedAccount();
    if (!acct) return;
    copyToClipboard(`${acct.username}:${acct.password}`, btnCopyAll);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── Typewriter effect ─────────────────────────────────────────────────────────
function typewriterEffect(text, targetId, speed = 70) {
  const el  = $(targetId);
  let   idx = 0;
  function type() {
    if (idx < text.length) {
      el.textContent += text[idx++];
      setTimeout(type, speed + Math.random() * 40);
    }
  }
  type();
}

// ── Orb parallax ─────────────────────────────────────────────────────────────
function orbParallax() {
  document.addEventListener('mousemove', e => {
    const x = (e.clientX / window.innerWidth  - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    document.querySelectorAll('.hero-orb').forEach((orb, i) => {
      const factor = i === 0 ? 1 : -0.6;
      orb.style.transform = `translate(${x * factor}px, ${y * factor}px)`;
    });
  });
}

// ── Generate accounts ─────────────────────────────────────────────────────────
async function generateAccounts() {
  if (running) return;

  const count = parseInt(countInput.value);
  const delay = parseFloat(delayInput.value);

  if (isNaN(count) || count < 1 || count > 200) {
    setStatus('Count must be 1–200', 'error'); return;
  }
  if (isNaN(delay) || delay < 0.5) {
    setStatus('Delay must be at least 0.5s', 'error'); return;
  }

  setRunning(true);
  setStatus('Starting generation…', 'active');

  const body = {
    count,
    delay,
    solver_service: solverService.value || null,
    solver_key:     solverKey.value.trim() || null,
    proxies:        proxies.length ? proxies : null,
  };

  try {
    const res  = await fetch(`${BACKEND_URL}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    taskId = data.task_id;
    streamAccounts(taskId);
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    setRunning(false);
  }
}

// ── SSE stream ────────────────────────────────────────────────────────────────
function streamAccounts(id) {
  eventSource = new EventSource(`${BACKEND_URL}/api/stream/${id}`);

  eventSource.onmessage = e => {
    const data = JSON.parse(e.data);

    if (data.type === 'done') {
      eventSource.close();
      setRunning(false);
      const success = accounts.filter(a => a.status === 'success').length;
      setStatus(`Done — ${success}/${accounts.length} succeeded`, 'done');
      return;
    }

    if (data.type === 'account') {
      const existing = accounts.find(a => a.index === data.index);
      if (existing) {
        Object.assign(existing, data);
        updateRow(data);
      } else {
        accounts.push({ ...data });
        addAccountRow(data);
        updateCountBadge();
      }
      updateProxyStats();
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (running) {
      setStatus('Connection lost', 'error');
      setRunning(false);
    }
  };
}

// ── Stop ──────────────────────────────────────────────────────────────────────
async function stopGeneration() {
  if (eventSource) eventSource.close();
  setRunning(false);
  setStatus('Stopped', 'done');
  if (taskId) {
    try { await fetch(`${BACKEND_URL}/api/stop/${taskId}`, { method: 'POST' }); } catch {}
    taskId = null;
  }
}

// ── Table rows ────────────────────────────────────────────────────────────────
function addAccountRow(acct) {
  emptyState.style.display = 'none';

  const tr = document.createElement('tr');
  tr.className = 'account-row';
  tr.id = `row-${acct.index}`;
  tr.style.animationDelay = `${Math.min(acct.index * 0.04, 0.3)}s`;

  tr.innerHTML = `
    <td class="col-index">${acct.index}</td>
    <td class="col-username">${escHtml(acct.username)}</td>
    <td class="col-status">${statusBadge(acct.status)}</td>
    <td class="col-time">${escHtml(acct.created_at)}</td>
  `;

  tr.addEventListener('click', () => showCredentials(acct));
  accountsBody.appendChild(tr);

  // Auto-scroll to new row
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateRow(acct) {
  const tr = $(`row-${acct.index}`);
  if (!tr) return;
  tr.querySelector('.col-status').innerHTML = statusBadge(acct.status);
  tr.onclick = () => showCredentials(acct);
}

function statusBadge(status) {
  if (status === 'success') return '<span class="badge badge-success">✓ Success</span>';
  if (status === 'failed')  return '<span class="badge badge-failed">✕ Failed</span>';
  return '<span class="badge badge-pending">● Pending</span>';
}

function updateCountBadge() {
  countBadge.textContent = `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`;
}

// ── Credentials modal ─────────────────────────────────────────────────────────
let _selectedAccount = null;

function showCredentials(acct) {
  _selectedAccount = acct;

  // Highlight selected row
  document.querySelectorAll('.account-row').forEach(r => r.classList.remove('selected'));
  const row = $(`row-${acct.index}`);
  if (row) row.classList.add('selected');

  modalUsername.textContent = acct.username;
  modalPassword.textContent = acct.password;
  modalStatus.innerHTML     = statusBadge(acct.status);
  modalTime.textContent     = acct.created_at;

  if (acct.error) {
    modalError.textContent     = acct.error;
    modalErrorWrap.style.display = '';
  } else {
    modalErrorWrap.style.display = 'none';
  }

  // Reset copy buttons
  document.querySelectorAll('.copy-btn').forEach(b => {
    b.textContent = 'Copy';
    b.classList.remove('copied');
  });
  btnCopyAll.querySelector ? null : null;

  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  document.querySelectorAll('.account-row').forEach(r => r.classList.remove('selected'));
  _selectedAccount = null;
}

function getSelectedAccount() { return _selectedAccount; }

// ── Clipboard ─────────────────────────────────────────────────────────────────
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig.includes('username') ? '📋  Copy username:password' : 'Copy';
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

// ── Proxies ───────────────────────────────────────────────────────────────────
async function fetchProxies() {
  btnFetchProxies.disabled    = true;
  btnFetchProxies.textContent = '⏳ Fetching…';
  setStatus('Fetching free proxies…', 'active');

  try {
    const res  = await fetch(`${BACKEND_URL}/api/proxies/fetch`);
    const data = await res.json();
    updateProxyBadge(data.count);
    setStatus(`✓ ${data.count} free proxies loaded`, 'done');
  } catch {
    setStatus('Could not fetch proxies — is the backend running?', 'error');
  } finally {
    btnFetchProxies.disabled    = false;
    btnFetchProxies.textContent = '🌐 Auto-Fetch Free Proxies';
  }
}

function applyProxies() {
  const raw = proxyPaste.value.trim();
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  proxies = lines;
  updateProxyBadge(lines.length);
  setStatus(`Applied ${lines.length} proxies`, 'done');
}

function updateProxyBadge(n) {
  proxyBadge.textContent = n > 0 ? `● ${n} proxies loaded` : '○ No proxies loaded';
  proxyBadge.className   = `proxy-count-badge${n > 0 ? ' loaded' : ''}`;
}

function updateProxyStats() {
  const success = accounts.filter(a => a.status === 'success').length;
  const failed  = accounts.filter(a => a.status === 'failed').length;
  if (success + failed > 0) {
    proxyStats.textContent = `✓ ${success} success  ✕ ${failed} failed`;
  }
}

// ── Solver status ─────────────────────────────────────────────────────────────
function updateSolverStatus() {
  const key     = solverKey.value.trim();
  const service = solverService.value;
  if (key && service) {
    solverStatus.textContent = `✓ ${service} key set`;
    solverStatus.classList.add('active');
  } else {
    solverStatus.textContent = 'No API key — captcha challenges will fail';
    solverStatus.classList.remove('active');
  }
}

function toggleKeyVisibility() {
  const isPass = solverKey.type === 'password';
  solverKey.type        = isPass ? 'text' : 'password';
  toggleKeyBtn.textContent = isPass ? '🙈' : '👁';
}

// ── UI state helpers ──────────────────────────────────────────────────────────
function setRunning(val) {
  running = val;
  btnGenerate.disabled = val;
  btnStop.disabled     = !val;
  btnGenerate.classList.toggle('loading', val);
}

function setStatus(msg, state = 'idle') {
  statusText.textContent = msg;
  statusDot.className = 'status-dot';
  if (state === 'active') statusDot.classList.add('active');
  if (state === 'done')   statusDot.classList.add('done');
  if (state === 'error')  statusDot.classList.add('error');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
