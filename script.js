let COUNTRIES = {};
let choices;

document.addEventListener('DOMContentLoaded', async () => {
  await initCountries(); // fetch countries and populate <select>

  const select = document.getElementById('country-select');
  choices = new Choices(select, {
    removeItemButton: true,
    placeholderValue: 'Select countries...',
    searchResultLimit: 10,
    renderChoiceLimit: -1
  });
});

async function initCountries() {
  const [nameRes, contRes] = await Promise.all([
    fetch('data/public/names.json'),
    fetch('data/public/continent.json')
  ]);

  const nameMap = await nameRes.json();
  const contMap = await contRes.json();
  const select = document.getElementById('country-select');
  const groups = new Map();

  Object.entries(nameMap).forEach(([alpha2, name]) => {
    const code = alpha2.toLowerCase();
    const key = name.toLowerCase().replace(/[^a-z]/g, '');
    const continentCode = contMap[alpha2];
    const continent = {
      NA: 'North America',
      SA: 'South America',
      EU: 'Europe',
      AS: 'Asia',
      AF: 'Africa',
      OC: 'Oceania'
    }[continentCode] || 'Other';

    const uiGroup = (continent === 'North America' && ['BZ','CR','SV','GT','HN','NI','PA'].includes(alpha2))
      ? 'Central America'
      : continent;

    COUNTRIES[key] = { name, code, continent, uiGroup };

    if (!groups.has(uiGroup)) groups.set(uiGroup, []);
    groups.get(uiGroup).push({ key, name });
  });

  const groupOrder = [
    'Africa',
    'Asia',
    'Europe',
    'North America',
    'Central America',
    'South America',
    'Oceania',
    'Other'
  ];
  const remainingGroups = Array.from(groups.keys())
    .filter(group => !groupOrder.includes(group))
    .sort((a, b) => a.localeCompare(b));

  [...groupOrder, ...remainingGroups].forEach(group => {
    const countries = groups.get(group);
    if (!countries) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = group;

    countries
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(({ key, name }) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = name;
        optgroup.appendChild(option);
      });

    select.appendChild(optgroup);
  });
}

function loadSelectedTimeline() {
  const selected = choices.getValue(true);
  if (!selected.length) return alert("Please select at least one country.");
  fetchAndRender(selected);

  // ✅ Collapse dropdown on all mobile browsers
  const inputEl = document.querySelector('.choices__inner input');
  if (inputEl) inputEl.blur();
}

async function fetchAndRender(keys) {
  const allData = {};
  await Promise.all(keys.map(async key => {
    try {
      const res = await fetch(`data/${key}.json`);
      allData[key] = await res.json();
    } catch {
      allData[key] = [];
      console.warn(`Missing or invalid file: data/${key}.json`);
    }
  }));
  renderMultiTimeline(allData, keys); // pass selected country keys in order
}

function renderMultiTimeline(countryDataMap, orderedKeys) {
  const yearsMap = new Map();

  Object.entries(countryDataMap).forEach(([key, events]) => {
    events.forEach(e => {
      const m = yearsMap.get(e.year) || {};
      m[key] = e.event;
      yearsMap.set(e.year, m);
    });
  });

  const years = Array.from(yearsMap.keys()).sort((a, b) => a - b);

  // ✅ Use orderedKeys to preserve selection order
  const thead = document.getElementById('timeline-head');
  thead.innerHTML = '';
  const headRow = document.createElement('tr');
  const yearHeader = document.createElement('th');
  yearHeader.textContent = 'Year';
  headRow.appendChild(yearHeader);

  orderedKeys.forEach(key => {
    const c = COUNTRIES[key];
    const th = document.createElement('th');
    const img = document.createElement('img');
    img.src = `https://flagcdn.com/24x18/${c.code}.png`;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    th.appendChild(img);
    th.appendChild(document.createTextNode(` ${c.name}`));
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.getElementById('timeline-body');
  tbody.innerHTML = '';
  years.forEach(year => {
    const tr = document.createElement('tr');
    const label = year < 0 ? `BC ${Math.abs(year)}` : `AD ${year}`;
    const yearCell = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = label;
    yearCell.appendChild(strong);
    tr.appendChild(yearCell);

    orderedKeys.forEach(k => {
      const td = document.createElement('td');
      const event = yearsMap.get(year)[k];

      if (event) {
        td.textContent = event;
      } else {
        td.className = 'empty-cell';
        const placeholder = document.createElement('span');
        placeholder.textContent = '—';
        td.appendChild(placeholder);
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
