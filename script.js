// ===== State =====
const COUNTRIES = {};            // key -> { name, code, continent, uiGroup }
const dataCache = {};            // key -> events array (lazy-loaded, cached)
let selectedKeys = [];           // ordered selection
let timelineShown = false;
const filters = { keyword: '', from: null, to: null };

const GROUP_ORDER = [
  'Africa', 'Asia', 'Europe', 'North America',
  'Central America', 'South America', 'Oceania', 'Other'
];

// Curated starting points for the empty state. Keys must match data/<key>.json.
const PRESETS = [
  { label: 'Ancient Civilizations', keys: ['egypt', 'greece', 'italy', 'china', 'iran', 'india'] },
  { label: 'WWII Powers', keys: ['unitedstates', 'unitedkingdom', 'germany', 'japan', 'russia', 'france', 'italy'] },
  { label: 'East Asia', keys: ['china', 'japan', 'southkorea'] },
  { label: 'North American Neighbors', keys: ['unitedstates', 'canada', 'mexico'] },
  { label: 'Empire Builders', keys: ['unitedkingdom', 'spain', 'portugal', 'france', 'netherlands'] }
];

// ===== Element refs (assigned on load) =====
let els = {};

document.addEventListener('DOMContentLoaded', async () => {
  els = {
    chips: document.getElementById('selected-chips'),
    search: document.getElementById('country-search'),
    clearBtn: document.getElementById('clear-btn'),
    list: document.getElementById('country-list'),
    emptyState: document.getElementById('empty-state'),
    presetChips: document.getElementById('preset-chips'),
    controls: document.getElementById('timeline-controls'),
    filterKeyword: document.getElementById('filter-keyword'),
    filterFrom: document.getElementById('filter-from'),
    filterTo: document.getElementById('filter-to'),
    filterSummary: document.getElementById('filter-summary'),
    resetFilters: document.getElementById('reset-filters'),
    wrapper: document.querySelector('.timeline-wrapper'),
    thead: document.getElementById('timeline-head'),
    tbody: document.getElementById('timeline-body'),
    noResults: document.getElementById('no-results')
  };

  await initCountries();
  buildCountryList();
  buildPresets();

  // Selector interactions
  els.search.addEventListener('input', () => buildCountryList(els.search.value));
  els.list.addEventListener('click', onListClick);
  els.clearBtn.addEventListener('click', clearSelection);

  // Filter interactions (live)
  els.filterKeyword.addEventListener('input', debounce(applyFilters, 150));
  els.filterFrom.addEventListener('input', debounce(applyFilters, 200));
  els.filterTo.addEventListener('input', debounce(applyFilters, 200));
  els.resetFilters.addEventListener('click', resetFilters);

  renderChips();
  updateView();
});

// ===== Data setup =====
async function initCountries() {
  const [nameRes, contRes] = await Promise.all([
    fetch('data/public/names.json'),
    fetch('data/public/continent.json')
  ]);
  const nameMap = await nameRes.json();
  const contMap = await contRes.json();

  Object.entries(nameMap).forEach(([alpha2, name]) => {
    const code = alpha2.toLowerCase();
    const key = name.toLowerCase().replace(/[^a-z]/g, '');
    const continent = {
      NA: 'North America', SA: 'South America', EU: 'Europe',
      AS: 'Asia', AF: 'Africa', OC: 'Oceania'
    }[contMap[alpha2]] || 'Other';
    const uiGroup = (continent === 'North America' && ['BZ', 'CR', 'SV', 'GT', 'HN', 'NI', 'PA'].includes(alpha2))
      ? 'Central America'
      : continent;
    COUNTRIES[key] = { name, code, continent, uiGroup };
  });
}

// ===== Country picker =====
function groupedCountries() {
  const groups = new Map();
  Object.entries(COUNTRIES).forEach(([key, c]) => {
    if (!groups.has(c.uiGroup)) groups.set(c.uiGroup, []);
    groups.get(c.uiGroup).push({ key, name: c.name });
  });
  const extras = [...groups.keys()].filter(g => !GROUP_ORDER.includes(g)).sort();
  return [...GROUP_ORDER, ...extras]
    .filter(g => groups.has(g))
    .map(g => ({
      group: g,
      countries: groups.get(g).sort((a, b) => a.name.localeCompare(b.name))
    }));
}

function buildCountryList(filterText = '') {
  const q = filterText.trim().toLowerCase();
  els.list.innerHTML = '';
  let shown = 0;

  groupedCountries().forEach(({ group, countries }) => {
    const matches = countries.filter(c => c.name.toLowerCase().includes(q));
    if (!matches.length) return;

    const header = document.createElement('div');
    header.className = 'group-header';
    header.textContent = group;
    els.list.appendChild(header);

    matches.forEach(({ key, name }) => {
      const isSel = selectedKeys.includes(key);
      const row = document.createElement('div');
      row.className = 'country-option' + (isSel ? ' selected' : '');
      row.dataset.key = key;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(isSel));

      const check = document.createElement('span');
      check.className = 'check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = isSel ? '✓' : '';

      const label = document.createElement('span');
      label.className = 'country-name';
      label.textContent = name;

      row.appendChild(check);
      row.appendChild(label);
      els.list.appendChild(row);
      shown++;
    });
  });

  if (!shown) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = 'No countries match your search.';
    els.list.appendChild(empty);
  }
}

function onListClick(e) {
  const row = e.target.closest('.country-option');
  if (!row) return;
  toggleCountry(row.dataset.key);
}

function toggleCountry(key) {
  const i = selectedKeys.indexOf(key);
  if (i === -1) selectedKeys.push(key);
  else selectedKeys.splice(i, 1);

  // Update only the affected row, keeping list scroll position.
  const row = els.list.querySelector(`.country-option[data-key="${key}"]`);
  if (row) {
    const isSel = selectedKeys.includes(key);
    row.classList.toggle('selected', isSel);
    row.setAttribute('aria-selected', String(isSel));
    row.querySelector('.check').textContent = isSel ? '✓' : '';
  }
  renderChips();
  scheduleRender();
}

function clearSelection() {
  selectedKeys = [];
  buildCountryList(els.search.value);
  renderChips();
  scheduleRender();
}

function renderChips() {
  els.chips.innerHTML = '';
  selectedKeys.forEach(key => {
    const c = COUNTRIES[key];
    if (!c) return;
    const chip = document.createElement('span');
    chip.className = 'chip';

    const flag = document.createElement('img');
    flag.src = `https://flagcdn.com/24x18/${c.code}.png`;
    flag.alt = '';
    flag.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.textContent = c.name;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.setAttribute('aria-label', `Remove ${c.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => toggleCountry(key));

    chip.append(flag, name, remove);
    els.chips.appendChild(chip);
  });
  els.clearBtn.hidden = selectedKeys.length === 0;
}

// ===== Presets =====
function buildPresets() {
  PRESETS.forEach(preset => {
    const valid = preset.keys.filter(k => COUNTRIES[k]);
    if (!valid.length) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-chip';
    chip.textContent = preset.label;
    chip.addEventListener('click', () => applyPreset(valid));
    els.presetChips.appendChild(chip);
  });
}

function applyPreset(keys) {
  selectedKeys = [...keys];
  buildCountryList(els.search.value);
  renderChips();
  scheduleRender();
}

// ===== Rendering pipeline =====
let renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderTimeline, 120);
}

async function loadData(keys) {
  await Promise.all(keys.map(async key => {
    if (dataCache[key]) return;
    try {
      const res = await fetch(`data/${key}.json`);
      dataCache[key] = await res.json();
    } catch {
      dataCache[key] = [];
      console.warn(`Missing or invalid file: data/${key}.json`);
    }
  }));
}

async function renderTimeline() {
  if (!selectedKeys.length) {
    timelineShown = false;
    updateView();
    return;
  }
  await loadData(selectedKeys);

  timelineShown = true;
  updateView();

  const { from, to, keyword } = filters;
  const inRange = y => (from === null || y >= from) && (to === null || y <= to);
  const matchesKw = txt => !keyword || txt.toLowerCase().includes(keyword);

  // Build year -> { key: event } from filtered events.
  const yearsMap = new Map();
  let eventCount = 0;
  selectedKeys.forEach(key => {
    (dataCache[key] || []).forEach(e => {
      if (!inRange(e.year) || !matchesKw(e.event)) return;
      const row = yearsMap.get(e.year) || {};
      row[key] = e.event;
      yearsMap.set(e.year, row);
      eventCount++;
    });
  });

  const years = [...yearsMap.keys()].sort((a, b) => a - b);

  // Header
  els.thead.innerHTML = '';
  const headRow = document.createElement('tr');
  const yearHead = document.createElement('th');
  yearHead.textContent = 'Year';
  headRow.appendChild(yearHead);
  selectedKeys.forEach(key => {
    const c = COUNTRIES[key];
    const th = document.createElement('th');
    th.appendChild(flagImg(c.code));
    th.appendChild(document.createTextNode(` ${c.name}`));
    headRow.appendChild(th);
  });
  els.thead.appendChild(headRow);

  // Body
  els.tbody.innerHTML = '';
  years.forEach(year => {
    const tr = document.createElement('tr');
    const yearCell = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = year < 0 ? `BC ${Math.abs(year)}` : `AD ${year}`;
    yearCell.appendChild(strong);
    tr.appendChild(yearCell);

    selectedKeys.forEach(key => {
      const td = document.createElement('td');
      const event = yearsMap.get(year)[key];
      if (event) {
        const c = COUNTRIES[key];
        const label = document.createElement('span');
        label.className = 'cell-country';
        label.appendChild(flagImg(c.code));
        label.appendChild(document.createTextNode(c.name));

        const text = document.createElement('span');
        text.className = 'cell-event';
        text.textContent = event;

        td.append(label, text);
      } else {
        td.className = 'empty-cell';
        const dash = document.createElement('span');
        dash.textContent = '—';
        td.appendChild(dash);
      }
      tr.appendChild(td);
    });
    els.tbody.appendChild(tr);
  });

  // Summary + no-results state
  const filtering = keyword || from !== null || to !== null;
  els.resetFilters.hidden = !filtering;
  els.noResults.hidden = eventCount > 0;
  els.wrapper.hidden = eventCount === 0;
  els.filterSummary.textContent = eventCount
    ? `${eventCount} event${eventCount === 1 ? '' : 's'} · ${years.length} year${years.length === 1 ? '' : 's'} · ${selectedKeys.length} ${selectedKeys.length === 1 ? 'country' : 'countries'}`
    : '';
}

function flagImg(code) {
  const img = document.createElement('img');
  img.src = `https://flagcdn.com/24x18/${code}.png`;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

// ===== Filters =====
function applyFilters() {
  filters.keyword = els.filterKeyword.value.trim().toLowerCase();
  filters.from = parseYear(els.filterFrom.value);
  filters.to = parseYear(els.filterTo.value);
  renderTimeline();
}

function parseYear(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function resetFilters() {
  els.filterKeyword.value = '';
  els.filterFrom.value = '';
  els.filterTo.value = '';
  filters.keyword = '';
  filters.from = null;
  filters.to = null;
  renderTimeline();
}

// ===== View toggling =====
function updateView() {
  const hasSelection = selectedKeys.length > 0;
  els.emptyState.hidden = hasSelection;
  els.controls.hidden = !timelineShown;
  els.wrapper.hidden = !timelineShown;
  if (!timelineShown) els.noResults.hidden = true;
}

// ===== Utils =====
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
