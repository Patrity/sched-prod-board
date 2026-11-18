import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('[data-testid="updated"]');

// R5: viewer's local time, in the viewer's own date order (en-GB, de-DE, … put the day first).
const fmt = new Intl.DateTimeFormat(navigator.languages?.[0] || navigator.language, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const acked = new Set();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function rowHtml(i) {
  return `<span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}" title="${esc(i.openedAt)}">${esc(fmt.format(new Date(i.openedAt)))}</time>
    <span class="act"></span>`;
}

function setAction(li) {
  const id = li.dataset.id;
  const slot = li.querySelector('.act');
  if (acked.has(id)) {
    slot.innerHTML = '<span data-testid="acked" class="acked">✓ acked</span>';
    li.classList.add('is-acked');
    return;
  }
  slot.innerHTML = '<button type="button" data-testid="ack">Ack</button>';
  slot.querySelector('button').addEventListener('click', onAck);
}

// R7: Ack asks to confirm, and the confirm names the incident it will ack. The id is bound when the
// button is pressed, so a list that moves while the confirm is open cannot change which incident is acked.
const confirmBox = document.querySelector('[data-testid="confirm"]');
const confirmText = confirmBox.querySelector('.confirm-text');
const confirmAck = confirmBox.querySelector('[data-testid="confirm-ack"]');
const confirmCancel = confirmBox.querySelector('[data-testid="confirm-cancel"]');
let pending = null;

function onAck(e) {
  const li = e.currentTarget.closest('[data-testid="incident-row"]');
  const id = li.dataset.id;
  const what = li.querySelector('.what').textContent;
  pending = { id, li };
  confirmText.innerHTML = `Ack <strong>${esc(id)}</strong>?<br><span class="confirm-what">${esc(what)}</span>`;
  confirmAck.textContent = `Ack ${id}`;
  confirmBox.hidden = false;
  confirmAck.focus();
}

function closeConfirm() {
  confirmBox.hidden = true;
  pending = null;
}

confirmCancel.addEventListener('click', closeConfirm);
confirmBox.addEventListener('click', (e) => { if (e.target === confirmBox) closeConfirm(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !confirmBox.hidden) closeConfirm(); });

confirmAck.addEventListener('click', async () => {
  if (!pending) return;
  const { id, li } = pending;
  closeConfirm();
  const btn = li.querySelector('[data-testid="ack"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Acking…'; }
  try {
    await ack(id); // R2
    acked.add(id);
  } catch (err) {
    console.error(err);
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    return;
  }
  setAction(li);
});

// R1: keep existing rows (and their state); add new incidents at the top, newest first.
function render(incidents) {
  const byId = new Map([...list.children].map((li) => [li.dataset.id, li]));
  const firstLoad = byId.size === 0;
  const wanted = new Set(incidents.map((i) => i.id));
  // Rows are never taken off the board while it is open: an incident that leaves the feed stays, marked.
  for (const [id, li] of byId) li.classList.toggle('is-gone', !wanted.has(id));
  let prev = null;
  for (const i of incidents) {
    let li = byId.get(i.id);
    if (!li) {
      li = document.createElement('li');
      li.setAttribute('data-testid', 'incident-row');
      li.dataset.id = i.id;
      li.className = `row ${i.severity}`;
      li.innerHTML = rowHtml(i);
      setAction(li);
      if (!firstLoad) li.classList.add('is-new');
    } else {
      // keep the row (and its Ack state); only refresh what the API changed
      const t = li.querySelector('time');
      if (t.getAttribute('datetime') !== i.openedAt) {
        t.setAttribute('datetime', i.openedAt);
        t.title = i.openedAt;
        t.textContent = fmt.format(new Date(i.openedAt));
      }
    }
    if (li.isConnected) { prev = li; continue; }
    const ref = prev ? prev.nextSibling : list.firstChild;
    list.insertBefore(li, ref);
    prev = li;
  }
  empty.hidden = list.children.length > 0;
}

async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    if (loader.isConnected) loader.remove(); // R3: gone once incidents load
    status.textContent = `updated ${fmt.format(new Date(page.updatedAt))}`;
  } catch (err) {
    console.error(err);
    status.textContent = `refresh failed: ${err.message}`;
  } finally {
    setTimeout(tick, REFRESH_MS); // R4
  }
}

tick();
