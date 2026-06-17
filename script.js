// ===== State =====
const COUNTRIES = {};            // key -> { name, code, continent, uiGroup }
const dataCache = {};            // key -> events array or in-flight Promise
const dataLoadFailures = new Set();
let selectedKeys = [];           // ordered selection
let timelineShown = false;
let renderSeq = 0;
const filters = { from: null, to: null };

const GROUP_ORDER = [
  'Africa', 'Asia', 'Europe', 'North America',
  'Central America', 'South America', 'Oceania', 'Other'
];

// Curated starting points for the empty state. Keys must match data/<key>.json.
const PRESETS = [
  { label: 'Ancient Civilizations', keys: ['egypt', 'greece', 'italy', 'china', 'iran', 'india'] },
  { label: 'WWII Powers', keys: ['unitedstates', 'unitedkingdom', 'germany', 'japan', 'russia', 'france', 'italy'] },
  { label: 'East Asia', keys: ['china', 'japan', 'southkorea', 'taiwan'] },
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
  els.search.addEventListener('input', debounce(() => buildCountryList(els.search.value), 120));
  els.list.addEventListener('change', onListChange);
  els.clearBtn.addEventListener('click', clearSelection);

  // Year-range filter (live)
  const applyFromFilter = debounce(applyFilters, 200);
  const applyToFilter = debounce(applyFilters, 200);
  els.filterFrom.addEventListener('input', () => {
    renderSeq++;
    applyFromFilter();
  });
  els.filterTo.addEventListener('input', () => {
    renderSeq++;
    applyToFilter();
  });
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
      const row = document.createElement('label');
      row.className = 'country-option' + (isSel ? ' selected' : '');

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'opt-check';
      check.dataset.key = key;
      check.checked = isSel;

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

function onListChange(e) {
  if (!e.target.classList.contains('opt-check')) return;
  setSelected(e.target.dataset.key, e.target.checked);
}

function setSelected(key, checked) {
  if (!key) return;
  const i = selectedKeys.indexOf(key);
  let changed = false;

  if (checked && i === -1) {
    selectedKeys.push(key);
    changed = true;
  } else if (!checked && i !== -1) {
    selectedKeys.splice(i, 1);
    changed = true;
  }

  syncCountryOption(key, checked);
  if (!changed) return;
  renderChips();
  scheduleRender();
}

function syncCountryOption(key, checked) {
  const inputs = els.list.querySelectorAll('.opt-check');
  const input = [...inputs].find(opt => opt.dataset.key === key);
  if (!input) return;
  input.checked = checked;
  input.closest('.country-option').classList.toggle('selected', checked);
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
    flag.loading = 'lazy';

    const name = document.createElement('span');
    name.textContent = c.name;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.setAttribute('aria-label', `Remove ${c.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => setSelected(key, false));

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
  renderSeq++;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderTimeline, 120);
}

async function loadData(keys) {
  await Promise.all(keys.map(async key => {
    if (!dataCache[key]) {
      dataCache[key] = fetch(`data/${key}.json`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(events => {
          dataLoadFailures.delete(key);
          return Array.isArray(events) ? events : [];
        })
        .catch(() => {
          dataLoadFailures.add(key);
          console.warn(`Missing or invalid file: data/${key}.json`);
          return [];
        });
    }
    const events = await dataCache[key];
    dataCache[key] = events;
  }));
}

async function renderTimeline() {
  const seq = ++renderSeq;
  if (!selectedKeys.length) {
    timelineShown = false;
    updateView();
    return;
  }
  await loadData(selectedKeys);
  if (seq !== renderSeq) return;

  timelineShown = true;
  updateView();

  const { from, to } = filters;
  const invertedRange = from !== null && to !== null && from > to;
  const inRange = y => !invertedRange && (from === null || y >= from) && (to === null || y <= to);

  // Build year -> { key: [events...] } from filtered events.
  const yearsMap = new Map();
  let eventCount = 0;
  selectedKeys.forEach(key => {
    (dataCache[key] || []).forEach(e => {
      if (!inRange(e.year)) return;
      const row = yearsMap.get(e.year) || {};
      if (!row[key]) row[key] = [];
      row[key].push(e.event);
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
      const events = yearsMap.get(year)[key] || [];
      if (events.length) {
        const c = COUNTRIES[key];
        const label = document.createElement('span');
        label.className = 'cell-country';
        label.appendChild(flagImg(c.code));
        label.appendChild(document.createTextNode(c.name));

        const eventList = document.createElement('span');
        eventList.className = 'cell-events';
        events.forEach(event => {
          const text = document.createElement('span');
          text.className = 'cell-event';
          text.textContent = event;
          eventList.appendChild(text);
        });

        td.append(label, eventList);
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
  const filtering = from !== null || to !== null;
  els.resetFilters.hidden = !filtering;
  els.noResults.hidden = eventCount > 0;
  els.wrapper.hidden = eventCount === 0;
  if (eventCount === 0) {
    els.noResults.textContent = noResultsMessage({ invertedRange, filtering });
  }
  els.filterSummary.textContent = eventCount
    ? `${eventCount} event${eventCount === 1 ? '' : 's'} · ${years.length} year${years.length === 1 ? '' : 's'} · ${selectedKeys.length} ${selectedKeys.length === 1 ? 'country' : 'countries'}`
    : '';
}

function noResultsMessage({ invertedRange, filtering }) {
  if (invertedRange) return 'From year must be earlier than To year.';

  const failed = selectedKeys.filter(key => dataLoadFailures.has(key));
  if (failed.length) {
    const names = failed.map(key => COUNTRIES[key]?.name || key).join(', ');
    return `Could not load data for ${names}.`;
  }

  if (filtering) return 'No events match these filters.';
  return 'No events available for the selected countries.';
}

function flagImg(code) {
  const img = document.createElement('img');
  img.src = `https://flagcdn.com/24x18/${code}.png`;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.loading = 'lazy';
  return img;
}

// ===== Filters =====
function applyFilters() {
  filters.from = parseYear(els.filterFrom.value);
  filters.to = parseYear(els.filterTo.value);
  renderTimeline();
}

function parseYear(v) {
  if (v === null || v === undefined) return null;
  const trimmed = String(v).trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function resetFilters() {
  els.filterFrom.value = '';
  els.filterTo.value = '';
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
