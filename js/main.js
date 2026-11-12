import { Globe } from './globe.js';
import { DESTINATIONS, DEPARTURES, CATEGORIES, greatCircleKm, flightMinutes, priceFrom, money, convert } from './data.js';

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const num = new Intl.NumberFormat('en-GB');
const byId = new Map(DESTINATIONS.map((d) => [d.id, d]));
const byDeparture = new Map(DEPARTURES.map((o) => [o.id, o]));
const mqMobile = window.matchMedia('(max-width: 860px)');
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const placeName = (d) => (d.name === d.country ? d.name : `${d.name}, ${d.country}`);
const airportName = (o) => (o.airport.startsWith(o.name) ? o.airport : `${o.name} ${o.airport}`);
const svg = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('globetravel:' + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('globetravel:' + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
};

const imageFor = (id) => `assets/images/${id}.jpg`;
const thumbFor = (id) => `assets/images/${id}-thumb.jpg`;
const durationText = (mins) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const prefs = Object.assign({ autoRotate: true, lighting: 'night', clouds: true, flightPath: true }, store.get('prefs', {}));
const state = {
  origin: byDeparture.get(store.get('origin', '')) || DEPARTURES[0],
  selected: null,
  hover: null,
  filter: 'All',
  query: '',
  saved: new Set(store.get('saved', []).filter((id) => byId.has(id))),
  trip: store.get('trip', []).filter((id) => byId.has(id)),
};
let credits = {};

// Package prices depend on where you fly from.
const priceOf = (d) => priceFrom(d.price, d, state.origin);
const wasOf = (d) => (d.was ? priceFrom(d.was, d, state.origin) : 0);
// Format an amount that is already in the departure airport's currency.
const fmt = (n) => money(n, state.origin.currency);

/* ------------------------------------------------------------------ */
/* Globe                                                               */
/* ------------------------------------------------------------------ */

const globe = (window.__globe = new Globe({
  canvas: $('#globe'),
  labelLayer: $('#labels'),
  destinations: DESTINATIONS,
  origin: state.origin,
  textures: {
    day: 'assets/textures/earth-day.jpg',
    night: 'assets/textures/earth-night.jpg',
    clouds: 'assets/textures/earth-clouds.jpg',
    topoWater: 'assets/textures/earth-topo-water.jpg',
  },
  onSelect: (id) => select(id),
  onHover: (id) => setHover(id),
  onProgress: (p) => ($('#loaderPct').textContent = `${Math.round(p * 100)}%`),
  onInteract: () => closeMenu(),
}));
Object.entries(prefs).forEach(([k, v]) => globe.setSetting(k, v));

/* ------------------------------------------------------------------ */
/* Labels on the globe                                                 */
/* ------------------------------------------------------------------ */

const labelEls = new Map();
function buildLabels() {
  const layer = $('#labels');
  for (const d of DESTINATIONS) {
    const el = document.createElement('button');
    el.className = 'pin is-hidden';
    el._hidden = true;
    el.dataset.id = d.id;
    el.innerHTML = `<span class="pin-dot"></span><span>${esc(d.name)}</span><span class="pin-price"></span>`;
    el.addEventListener('click', () => select(d.id));
    el.addEventListener('mouseenter', () => setHover(d.id));
    el.addEventListener('mouseleave', () => setHover(null));
    layer.appendChild(el);
    labelEls.set(d.id, el);
  }
  const o = document.createElement('div');
  o.className = 'pin pin--origin is-hidden';
  o._hidden = true;
  o.innerHTML = `<span class="pin-dot"></span><span class="pin-name"></span><small>Departure</small>`;
  layer.appendChild(o);
  labelEls.set('origin', o);
  globe.setLabels(labelEls);
}

/* ------------------------------------------------------------------ */
/* Search, filters and the list                                        */
/* ------------------------------------------------------------------ */

const listEl = $('#destList');
const itemEls = new Map();

function buildChips() {
  const wrap = $('#chips');
  wrap.innerHTML = CATEGORIES.map(
    (c) => `<button class="chip" role="tab" data-filter="${c}" aria-selected="${c === state.filter}">${c === 'Saved' ? 'Saved' : c}</button>`
  ).join('');
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) setFilter(b.dataset.filter);
  });
}

function buildList() {
  for (const d of DESTINATIONS) {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    li.innerHTML = `
      <button class="dest-item" role="option" aria-selected="false" data-id="${d.id}">
        <img class="dest-thumb" src="${thumbFor(d.id)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
        <span class="dest-text">
          <span class="dest-name">${esc(placeName(d))}</span>
          <span class="dest-sub">${d.nights} nights <b class="dest-price"></b></span>
        </span>
        ${svg('i-chevron-right')}
      </button>`;
    const btn = li.firstElementChild;
    btn.addEventListener('click', () => select(d.id));
    btn.addEventListener('mouseenter', () => setHover(d.id));
    btn.addEventListener('mouseleave', () => setHover(null));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const vis = visibleItems();
        const i = vis.indexOf(btn);
        const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const next = vis[i + dir];
        if (next) {
          e.preventDefault();
          next.focus();
        } else if (dir < 0 && e.key === 'ArrowUp') {
          e.preventDefault();
          $('#search').focus();
        }
      }
    });
    listEl.appendChild(li);
    itemEls.set(d.id, btn);
  }
}

const visibleItems = () => [...itemEls.values()].filter((b) => !b.parentElement.hidden);

function matches(d) {
  const f = state.filter;
  if (f === 'Deals' && !d.was) return false;
  if (f === 'Saved' && !state.saved.has(d.id)) return false;
  if (!['All', 'Deals', 'Saved'].includes(f) && !d.tags.includes(f)) return false;
  const q = norm(state.query.trim());
  if (!q) return true;
  const hay = norm([d.name, d.country, d.region, ...d.tags, ...d.highlights].join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderList() {
  let n = 0;
  const order = state.filter === 'Deals' ? [...DESTINATIONS].sort((a, b) => priceOf(a) - priceOf(b)) : DESTINATIONS;
  for (const d of order) {
    const li = itemEls.get(d.id).parentElement;
    const show = matches(d);
    li.hidden = !show;
    if (show) n++;
    listEl.appendChild(li);
    itemEls.get(d.id).querySelector('.trip-dot')?.remove();
    if (state.trip.includes(d.id)) itemEls.get(d.id).insertAdjacentHTML('beforeend', '<span class="trip-dot" aria-label="In your trip"></span>');
  }
  $('#destCount').textContent = `${n} of ${DESTINATIONS.length}`;
  const empty = $('#destEmpty');
  empty.hidden = n > 0;
  if (!n) {
    $('#emptyQuery').textContent = state.query || state.filter;
    if (state.filter === 'Saved' && !state.query) {
      empty.textContent = 'Nothing saved yet. Tap the heart on a destination to keep it here.';
    } else {
      empty.innerHTML = `No destinations match “<span id="emptyQuery">${esc(state.query || state.filter)}</span>”. Try a country, or a word like beach or city.`;
    }
  }
  // Dim labels that are filtered out
  for (const d of DESTINATIONS) {
    const el = labelEls.get(d.id);
    if (el) el.style.filter = matches(d) ? '' : 'grayscale(1) brightness(.6)';
  }
}

function setFilter(f) {
  state.filter = f;
  $$('.chip').forEach((c) => c.setAttribute('aria-selected', String(c.dataset.filter === f)));
  $('#savedBtn').setAttribute('aria-pressed', String(f === 'Saved'));
  $$('.nav-link').forEach((n) => n.classList.toggle('is-active', n.dataset.nav === (f === 'Deals' ? 'deals' : 'destinations')));
  renderList();
  const active = $(`.chip[data-filter="${f}"]`);
  active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function bindSearch() {
  const input = $('#search');
  input.addEventListener('input', () => {
    state.query = input.value;
    renderList();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = visibleItems()[0];
      if (first) {
        select(first.dataset.id);
        input.blur();
      }
    } else if (e.key === 'ArrowDown') {
      const first = visibleItems()[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      state.query = '';
      renderList();
      input.blur();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Selection and the destination card                                 */
/* ------------------------------------------------------------------ */

const card = $('#card');
let clockTimer;

function select(id, { fly = true } = {}) {
  const d = byId.get(id);
  if (!d) return;
  const wasOpen = !card.hidden;
  const same = state.selected === id;
  state.selected = id;

  for (const [key, btn] of itemEls) btn.setAttribute('aria-selected', String(key === id));
  for (const [key, el] of labelEls) el.classList.toggle('is-active', key === id);
  globe.setSelected(id);

  if (!same || card.hidden) renderCard(d, wasOpen && !same);
  card.hidden = false;
  layoutViewport();
  if (fly) globe.flyTo(d.lat, d.lon);
  updateRoute();

  const item = itemEls.get(id);
  item?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  try {
    history.replaceState(null, '', '#' + id);
  } catch {
    /* sandboxed frames may refuse */
  }
}

function deselect() {
  state.selected = null;
  card.hidden = true;
  for (const btn of itemEls.values()) btn.setAttribute('aria-selected', 'false');
  for (const el of labelEls.values()) el.classList.remove('is-active');
  globe.setSelected(null);
  layoutViewport();
  updateRoute();
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* ignore */
  }
}

function step(dir) {
  const vis = visibleItems().map((b) => b.dataset.id);
  const pool = vis.length ? vis : DESTINATIONS.map((d) => d.id);
  const i = pool.indexOf(state.selected);
  const next = pool[(i + dir + pool.length) % pool.length];
  select(next);
}

function starRow(rating) {
  const stars = Array.from({ length: 5 }, () => svg('i-star')).join('');
  return `<span class="stars" aria-hidden="true">${stars}<span class="stars-fill" style="width:${(rating / 5) * 100}%">${stars}</span></span>`;
}

function renderCard(d, animate) {
  const img = $('#cardImg');
  img.classList.add('is-loading');
  img.classList.remove('is-missing');
  img.onload = () => img.classList.remove('is-loading');
  img.onerror = () => img.classList.replace('is-loading', 'is-missing');
  img.src = imageFor(d.id);
  img.alt = `${d.name}, ${d.country}`;

  const cr = credits[d.id];
  const credit = $('#cardCredit');
  if (cr) {
    credit.textContent = `Photo: ${cr.author} · ${cr.license}`;
    credit.href = cr.source;
    credit.hidden = false;
  } else credit.hidden = true;

  const badge = $('#cardBadge');
  badge.hidden = !d.badge;
  badge.textContent = d.badge === 'save' ? `Save ${fmt(wasOf(d) - priceOf(d))}` : d.badge || '';

  $('#cardRegion').textContent = `${d.country} · ${d.region}`;
  $('#cardTitle').textContent = d.country === d.name ? d.name : `${d.name}, ${d.country}`;
  $('#cardRating').innerHTML = `${starRow(d.rating)}<b>${d.rating.toFixed(1)}</b><span>(${num.format(d.reviews)} reviews)</span>`;
  $('#cardRating').setAttribute('aria-label', `Rated ${d.rating} out of 5 from ${num.format(d.reviews)} reviews`);
  $('#cardDesc').textContent = d.blurb;
  $('#cardNights').innerHTML = `${d.nights} Nights<br><small>hotel</small>`;
  const [b1, ...rest] = d.board.split(' ');
  $('#cardBoard').innerHTML = d.board === 'Room only' ? 'Room<br><small>only</small>' : `${b1}<br><small>${rest.join(' ') || 'included'}</small>`;

  const km = greatCircleKm(state.origin, d);
  $('#cardFlightLabel').textContent = `From ${state.origin.name}`;
  $('#cardFlight').textContent = durationText(flightMinutes(km));
  $('#cardFlight').title = `${num.format(Math.round(km))} km great-circle distance`;
  $('#cardBest').textContent = d.bestTime;
  updateClock(d);
  clearInterval(clockTimer);
  clockTimer = setInterval(() => state.selected && updateClock(byId.get(state.selected)), 20000);

  const was = $('#cardWas');
  was.hidden = !d.was;
  was.textContent = d.was ? fmt(wasOf(d)) : '';
  $('#cardPrice').textContent = fmt(priceOf(d));
  $('#footPrice').textContent = fmt(priceOf(d));
  syncCardButtons();

  if (animate) {
    const body = $('#cardBody');
    body.classList.remove('is-swapping');
    void body.offsetWidth;
    body.classList.add('is-swapping');
  }
  $('#cardBody').scrollTop = 0;
}

function updateClock(d) {
  try {
    $('#cardTime').textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: d.tz }).format(new Date());
  } catch {
    $('#cardTime').textContent = '—';
  }
}

function syncCardButtons() {
  const id = state.selected;
  if (!id) return;
  const fav = $('#cardFav');
  const saved = state.saved.has(id);
  fav.setAttribute('aria-pressed', String(saved));
  fav.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save destination');
  const add = $('#cardAddTrip');
  const inTrip = state.trip.includes(id);
  add.classList.toggle('is-added', inTrip);
  add.innerHTML = inTrip ? `${svg('i-check')}<span>In your trip</span>` : `${svg('i-plus')}<span>Add to trip</span>`;
  add.setAttribute('aria-label', inTrip ? 'Remove from your trip' : 'Add to your trip');
}

/* ------------------------------------------------------------------ */
/* Saved + trip                                                        */
/* ------------------------------------------------------------------ */

function toggleSaved(id) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
    toast(`Removed ${byId.get(id).name} from saved`);
  } else {
    state.saved.add(id);
    toast(`Saved ${byId.get(id).name}`);
  }
  store.set('saved', [...state.saved]);
  renderBadges();
  syncCardButtons();
  if (state.filter === 'Saved') renderList();
}

function toggleTrip(id) {
  const i = state.trip.indexOf(id);
  if (i >= 0) {
    state.trip.splice(i, 1);
    toast(`Removed ${byId.get(id).name} from your trip`);
  } else {
    if (state.trip.length >= 6) return toast('A trip can have up to 6 stops');
    state.trip.push(id);
    toast(`Added ${byId.get(id).name} as stop ${state.trip.length}`);
  }
  store.set('trip', state.trip);
  renderTrip();
  renderList();
  syncCardButtons();
  updateRoute();
}

function renderBadges() {
  const s = $('#savedCount');
  s.hidden = state.saved.size === 0;
  s.textContent = state.saved.size;
  const t = $('#tripCount');
  t.hidden = state.trip.length === 0;
  t.textContent = state.trip.length;
}

function renderTrip() {
  const wrap = $('#trip');
  wrap.hidden = state.trip.length === 0;
  const names = [state.origin.name, ...state.trip.map((id) => byId.get(id).name)];
  $('#tripRoute').innerHTML = names.map(esc).join('<i>→</i>');
  const total = state.trip.reduce((s, id) => s + priceOf(byId.get(id)), 0);
  $('#tripPrice').textContent = `from ${fmt(total)}`;
  for (const [id, el] of labelEls) el.classList.toggle('in-trip', state.trip.includes(id));
  renderBadges();
  layoutViewport();
}

let routeKey = '';
function updateRoute() {
  if (!globe.routeGroup) return; // globe still loading; select() draws the route later
  const stops = [state.origin, ...state.trip.map((id) => byId.get(id))];
  let previewFrom = Infinity;
  if (state.selected && !state.trip.includes(state.selected)) {
    if (state.trip.length) previewFrom = state.trip.length;
    stops.push(byId.get(state.selected));
  }
  const key = stops.map((s) => s.id).join('>') + '|' + previewFrom;
  if (key === routeKey) return;
  routeKey = key;
  globe.setRoute(stops.length > 1 ? stops : [], { previewFrom });
}

/* ------------------------------------------------------------------ */
/* Booking                                                             */
/* ------------------------------------------------------------------ */

const book = { ids: [], adults: 2, children: 0 };
const bookDialog = $('#bookDialog');

function isoDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function openBooking(ids) {
  book.ids = ids;
  book.adults = 2;
  book.children = 0;
  const dests = ids.map((id) => byId.get(id));
  const multi = dests.length > 1;
  $('#bookTitle').textContent = multi
    ? `${dests.length}-stop trip from ${state.origin.name}`
    : dests[0].name === dests[0].country
      ? dests[0].name
      : `${dests[0].name}, ${dests[0].country}`;
  $('#bookStops').innerHTML = dests
    .map(
      (d, i) => `
      <div class="stop">
        <img src="${thumbFor(d.id)}" alt="" onerror="this.style.visibility='hidden'">
        <span><b>${multi ? `${i + 1}. ` : ''}${esc(placeName(d))}</b>
        <small>${d.nights} nights · ${esc(d.board)}${i === 0 ? ' · return flights included' : ''}</small></span>
        <span>${fmt(priceOf(d))}</span>
      </div>`
    )
    .join('');
  $('#bookFrom').value = state.origin.id;
  const min = new Date(Date.now() + 3 * 86400000);
  const def = new Date(Date.now() + 28 * 86400000);
  const date = $('#bookDate');
  date.min = isoDate(min);
  date.value = isoDate(def);
  $('#bookForm').hidden = false;
  $('#bookSuccess').hidden = true;
  $('#formError').hidden = true;
  $$('#bookForm [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  $('#bookForm').querySelector('input[name="room"][value="0"]').checked = true;
  updateBooking();
  bookDialog.showModal();
}

function updateBooking() {
  const dests = book.ids.map((id) => byId.get(id));
  const base = dests.reduce((s, d) => s + priceOf(d), 0);
  const room = convert(Number($('#bookForm').querySelector('input[name="room"]:checked').value), state.origin.currency);
  document.querySelectorAll('#bookForm input[name="room"]').forEach((r) => {
    const v = Number(r.value);
    r.nextElementSibling.querySelector('small').textContent = v ? `+${fmt(convert(v, state.origin.currency))} pp` : 'Included';
  });
  const guests = book.adults + book.children;
  const childPrice = Math.round(base * 0.7);
  const roomTotal = room * guests * dests.length;
  const total = base * book.adults + childPrice * book.children + roomTotal;
  $('#adults').textContent = book.adults;
  $('#children').textContent = book.children;
  $$('[data-step]').forEach((b) => {
    const key = b.dataset.step;
    const dir = Number(b.dataset.dir);
    const v = book[key];
    b.disabled = key === 'adults' ? (dir < 0 ? v <= 1 : v >= 9) : dir < 0 ? v <= 0 : v >= 6;
  });
  const rows = [[`${book.adults} adult${book.adults > 1 ? 's' : ''} × ${fmt(base)}`, base * book.adults]];
  if (book.children) rows.push([`${book.children} child${book.children > 1 ? 'ren' : ''} × ${fmt(childPrice)}`, childPrice * book.children]);
  if (roomTotal) rows.push([`Room upgrade × ${guests} guest${guests > 1 ? 's' : ''}${dests.length > 1 ? ` × ${dests.length} stays` : ''}`, roomTotal]);
  rows.push(['Taxes, fees and 23 kg bag', 0]);
  $('#breakdown').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? fmt(v) : 'Included'}</dd></div>`).join('');
  $('#bookTotal').textContent = fmt(total);
}

function bindBooking() {
  const form = $('#bookForm');
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    book[b.dataset.step] += Number(b.dataset.dir);
    updateBooking();
  });
  form.addEventListener('change', updateBooking);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#bookName');
    const email = $('#bookEmail');
    const date = $('#bookDate');
    const problems = [];
    [name, email, date].forEach((el) => el.removeAttribute('aria-invalid'));
    if (name.value.trim().length < 2) {
      problems.push('enter the lead passenger’s full name');
      name.setAttribute('aria-invalid', 'true');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      problems.push('add an email address like name@example.com');
      email.setAttribute('aria-invalid', 'true');
    }
    if (!date.value || date.value < date.min) {
      problems.push(`pick a departure date on or after ${date.min.split('-').reverse().join('/')}`);
      date.setAttribute('aria-invalid', 'true');
    }
    const err = $('#formError');
    if (problems.length) {
      err.textContent = `To confirm, ${problems.join(', and ')}.`;
      err.hidden = false;
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    err.hidden = true;
    const ref = 'GT-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const dests = book.ids.map((id) => byId.get(id).name);
    $('#successDest').textContent = dests.length > 1 ? dests.slice(0, -1).join(', ') + ' and ' + dests.at(-1) : dests[0];
    $('#successRef').textContent = ref;
    form.hidden = true;
    $('#bookSuccess').hidden = false;
    $('#bookSuccess .btn-primary').focus();
  });
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Info dialogs                                                        */
/* ------------------------------------------------------------------ */

function openInfo(kind) {
  const dlg = $('#infoDialog');
  const body = $('#infoBody');
  if (kind === 'about') {
    $('#infoTitle').textContent = 'About GlobeTravel';
    const photoList = DESTINATIONS.filter((d) => credits[d.id])
      .map((d) => {
        const c = credits[d.id];
        return `<li>${esc(d.name)}: <a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.author)}</a>, ${esc(c.license)}</li>`;
      })
      .join('');
    body.innerHTML = `
      <p>We put together holidays with return flights from ${DEPARTURES.length} airports to ${DESTINATIONS.length} places we love. Spin the globe to explore, then add stops to build a multi-city trip.</p>
      <p>Pins sit on each destination’s real latitude and longitude. Choose <b>Live</b> lighting to see where the sun is shining right now.</p>
      <h3>Credits</h3>
      <ul>
        <li>Earth day, night, cloud and topography maps: NASA Blue Marble and Black Marble imagery, via the three-globe project</li>
        <li>3D rendering: three.js (MIT licence)</li>
        ${photoList}
      </ul>`;
  } else {
    $('#infoTitle').textContent = 'Talk to a travel expert';
    body.innerHTML = `
      <p>Our team can tailor any package, add nights or arrange stopovers. We reply within one working day.</p>
      <div class="copy-row"><span>020 7946 0321</span><button type="button" data-copy="020 7946 0321">Copy</button></div>
      <div class="copy-row"><span>hello@globetravel.example</span><button type="button" data-copy="hello@globetravel.example">Copy</button></div>
      <p>Open Monday to Saturday, 9:00 – 18:00 UK time.</p>`;
    body.querySelectorAll('[data-copy]').forEach((b) =>
      b.addEventListener('click', () => {
        navigator.clipboard
          ?.writeText(b.dataset.copy)
          .then(() => (b.textContent = 'Copied'))
          .catch(() => {
            const range = document.createRange();
            range.selectNodeContents(b.previousElementSibling);
            const sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          });
      })
    );
  }
  dlg.showModal();
}

/* ------------------------------------------------------------------ */
/* Controls, nav, keyboard                                             */
/* ------------------------------------------------------------------ */

function savePrefs() {
  store.set('prefs', prefs);
}

function syncControls() {
  $('#ctlRotate').setAttribute('aria-pressed', String(prefs.autoRotate));
  $$('[data-light]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.light === prefs.lighting)));
  $('#ctlClouds').setAttribute('aria-checked', String(prefs.clouds));
  $('#ctlPath').setAttribute('aria-checked', String(prefs.flightPath));
}

function bindControls() {
  $('#ctlRotate').addEventListener('click', () => {
    prefs.autoRotate = !prefs.autoRotate;
    globe.setSetting('autoRotate', prefs.autoRotate);
    syncControls();
    savePrefs();
  });
  $$('[data-light]').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.lighting = b.dataset.light;
      globe.setSetting('lighting', prefs.lighting);
      syncControls();
      savePrefs();
      if (prefs.lighting === 'live') {
        const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date());
        toast(`Showing the real sun position at ${t} UTC`);
      }
    })
  );
  $('#ctlClouds').addEventListener('click', () => {
    prefs.clouds = !prefs.clouds;
    globe.setSetting('clouds', prefs.clouds);
    syncControls();
    savePrefs();
  });
  $('#ctlPath').addEventListener('click', () => {
    prefs.flightPath = !prefs.flightPath;
    globe.setSetting('flightPath', prefs.flightPath);
    syncControls();
    savePrefs();
  });
  $('#zoomIn').addEventListener('click', () => globe.zoomBy(0.8));
  $('#zoomOut').addEventListener('click', () => globe.zoomBy(1.25));
  $('#zoomReset').addEventListener('click', () => globe.resetView());

  $('#cardClose').addEventListener('click', deselect);
  $('#cardPrev').addEventListener('click', () => step(-1));
  $('#cardNext').addEventListener('click', () => step(1));
  $('#cardFav').addEventListener('click', () => state.selected && toggleSaved(state.selected));
  $('#cardAddTrip').addEventListener('click', () => state.selected && toggleTrip(state.selected));
  $('#cardBook').addEventListener('click', () => state.selected && openBooking([state.selected]));
  $('#tripBook').addEventListener('click', () => state.trip.length && openBooking([...state.trip]));
  $('#tripClear').addEventListener('click', () => {
    state.trip = [];
    store.set('trip', state.trip);
    renderTrip();
    renderList();
    syncCardButtons();
    updateRoute();
    toast('Trip cleared');
  });

  $('#searchBtn').addEventListener('click', () => {
    const s = $('#search');
    s.focus();
    s.select();
  });
  $('#savedBtn').addEventListener('click', () => setFilter(state.filter === 'Saved' ? 'All' : 'Saved'));
  $('#tripBtn').addEventListener('click', () => {
    if (state.trip.length) openBooking([...state.trip]);
    else toast('Your trip is empty. Use “Add to trip” on any destination.');
  });

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    closeMenu();
    const n = b.dataset.nav;
    if (n === 'destinations') {
      setFilter('All');
      $('#search').focus();
    } else if (n === 'deals') {
      setFilter('Deals');
      toast('Showing holidays with a price drop, cheapest first');
    } else if (n === 'inspire') {
      const pool = DESTINATIONS.filter((d) => d.id !== state.selected);
      select(pool[(Math.random() * pool.length) | 0].id);
    } else openInfo(n);
  });
  $('#menuBtn').addEventListener('click', () => {
    const open = !$('#nav').classList.contains('is-open');
    $('#nav').classList.toggle('is-open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, select, textarea') || document.querySelector('dialog[open]');
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      $('#search').focus();
    } else if (e.key === 'Escape') {
      if ($('#nav').classList.contains('is-open')) closeMenu();
      else if (state.selected) deselect();
    } else if (state.selected && (e.key === ']' || (e.key === 'ArrowRight' && e.target === document.body))) {
      step(1);
    } else if (state.selected && (e.key === '[' || (e.key === 'ArrowLeft' && e.target === document.body))) {
      step(-1);
    }
  });

  // Swipe the bottom sheet down to close it on phones.
  let drag = null;
  card.addEventListener('touchstart', (e) => {
    if (!mqMobile.matches || $('#cardBody').scrollTop > 0) return;
    drag = { y: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  card.addEventListener('touchmove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    card.style.transform = `translateY(${drag.dy}px)`;
  }, { passive: true });
  card.addEventListener('touchend', () => {
    if (!drag) return;
    card.style.transform = '';
    if (drag.dy > 90) deselect();
    drag = null;
  });
}

function closeMenu() {
  $('#nav').classList.remove('is-open');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

function setHover(id) {
  if (state.hover === id) return;
  state.hover = id;
  globe.setHover(id);
  for (const [key, el] of labelEls) el.classList.toggle('is-hover', key === id);
  for (const [key, el] of itemEls) el.classList.toggle('is-hover', key === id);
}

/* ------------------------------------------------------------------ */
/* Layout: tell the globe which part of the screen is free             */
/* ------------------------------------------------------------------ */

function layoutViewport() {
  const stage = $('.stage').getBoundingClientRect();
  const hud = $('#hud').getBoundingClientRect();
  const sheetOpen = mqMobile.matches && !card.hidden;
  document.body.classList.toggle('sheet-open', sheetOpen);
  let rect;
  if (mqMobile.matches) {
    // offsetHeight ignores the slide-in transform, so this is where the sheet will settle.
    const top = sheetOpen ? $('.topbar').getBoundingClientRect().bottom + 4 : stage.top;
    const bottom = sheetOpen ? window.innerHeight - card.offsetHeight - 6 : stage.bottom;
    rect = { x: 0, y: top, w: hud.width, h: Math.max(140, bottom - top) };
  } else {
    rect = { x: stage.left, y: stage.top, w: stage.width, h: hud.bottom - stage.top - 10 };
  }
  globe.setViewport(rect);
}

/* ------------------------------------------------------------------ */
/* Departure airport                                                   */
/* ------------------------------------------------------------------ */

function buildDepartures() {
  const opts = DEPARTURES.map((o) => `<option value="${o.id}">${esc(o.name)}, ${esc(o.country)}</option>`).join('');
  $('#fromSelect').innerHTML = opts;
  $('#bookFrom').innerHTML = DEPARTURES.map((o) => `<option value="${o.id}">${esc(airportName(o))} · ${o.currency}</option>`).join('');
  $('#fromSelect').addEventListener('change', (e) => setOrigin(e.target.value, { fly: true }));
  $('#bookFrom').addEventListener('change', (e) => {
    setOrigin(e.target.value);
    openBookingRefresh();
  });
}

function renderPrices() {
  for (const d of DESTINATIONS) {
    const p = fmt(priceOf(d));
    const pin = labelEls.get(d.id);
    pin.querySelector('.pin-price').textContent = p;
    pin.setAttribute('aria-label', `${d.name}, ${d.country}. From ${p} per person`);
    itemEls.get(d.id).querySelector('.dest-price').textContent = p;
  }
}

function setOrigin(id, { fly = false } = {}) {
  const o = byDeparture.get(id);
  if (!o) return;
  const changed = o !== state.origin;
  state.origin = o;
  store.set('origin', o.id);
  $('#fromSelect').value = o.id;
  $('#bookFrom').value = o.id;
  $('#heroFrom').textContent = o.name;
  $('#fromCurrency').textContent = o.currency;
  labelEls.get('origin').querySelector('.pin-name').textContent = o.name;
  globe.setOrigin(o);
  renderPrices();
  renderList();
  renderTrip();
  if (state.selected) renderCard(byId.get(state.selected), false);
  updateRoute();
  if (changed) {
    toast(`Prices now in ${o.currency}, with return flights from ${o.name}`);
    if (fly && !state.selected) globe.flyTo(o.lat, o.lon);
  }
}

// Re-render the open booking dialog after the departure changes inside it.
function openBookingRefresh() {
  if (!bookDialog.open) return;
  const keep = { adults: book.adults, children: book.children };
  const dests = book.ids.map((id) => byId.get(id));
  $('#bookStops').querySelectorAll('.stop > span:last-child').forEach((el, i) => (el.textContent = fmt(priceOf(dests[i]))));
  if (dests.length > 1) $('#bookTitle').textContent = `${dests.length}-stop trip from ${state.origin.name}`;
  Object.assign(book, keep);
  updateBooking();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

buildLabels();
buildChips();
buildList();
buildDepartures();
setOrigin(state.origin.id);
bindSearch();
bindControls();
bindBooking();
syncControls();
renderTrip();
renderList();

fetch('assets/images/credits.json')
  .then((r) => (r.ok ? r.json() : {}))
  .then((c) => {
    credits = c || {};
    if (state.selected) renderCard(byId.get(state.selected), false);
  })
  .catch(() => {});

new ResizeObserver(() => layoutViewport()).observe($('#hud'));
mqMobile.addEventListener('change', () => requestAnimationFrame(layoutViewport));

globe.ready
  .then(() => {
    layoutViewport();
    $('#loader').classList.add('is-done');
    globe.intro();
    const fromHash = decodeURIComponent(location.hash.slice(1));
    const first = byId.has(fromHash) ? fromHash : 'santorini';
    setTimeout(() => select(first), 650);
  })
  .catch((err) => {
    console.error(err);
    $('.loader-text').textContent = 'The globe could not load. Check your connection and refresh the page.';
  });
