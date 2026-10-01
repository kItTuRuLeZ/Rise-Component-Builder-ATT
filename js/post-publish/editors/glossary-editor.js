// @ts-nocheck
import { escapeAttribute, escapeHTML, sanitizeRichText, sanitizeURL } from '../../utilities.js';
import { createRichTextEditor } from '../../rich-text-editor.js';

/**
 * Parses CSV text safely, protecting against spreadsheet formula injection and handling quotes/commas.
 * @param {string} csvText
 * @returns {{ headers: string[], rows: Record<string, string>[], errors: string[] }}
 */
export function parseGlossaryCSV(csvText) {
  const errors = [];
  const rows = [];
  if (!csvText || typeof csvText !== 'string') {
    return { headers: [], rows: [], errors: ['CSV content is empty.'] };
  }

  // Simple RFC 4180 CSV parser
  const lines = [];
  let currentField = '';
  let insideQuotes = false;
  let currentLine = [];

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentLine.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++; // skip CRLF
      currentLine.push(currentField);
      currentField = '';
      if (currentLine.some(f => f.trim().length > 0)) {
        lines.push(currentLine);
      }
      currentLine = [];
    } else {
      currentField += char;
    }
  }
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    if (currentLine.some(f => f.trim().length > 0)) {
      lines.push(currentLine);
    }
  }

  if (lines.length < 2) {
    return { headers: [], rows: [], errors: ['CSV must contain a header row and at least one data row.'] };
  }

  const rawHeaders = lines[0].map(h => h.trim());
  const headerMap = {
    term: ['term', 'word', 'name', 'title'],
    definition: ['definition', 'meaning', 'description', 'def'],
    abbreviation: ['abbreviation', 'abbrev', 'acronym', 'short'],
    aliases: ['aliases', 'alias', 'synonyms', 'keywords', 'search terms'],
    category: ['category', 'topic', 'group', 'tag'],
    resourceLabel: ['resourcelabel', 'resource_label', 'linklabel', 'link_label', 'link text'],
    resourceUrl: ['resourceurl', 'resource_url', 'linkurl', 'link_url', 'url', 'link']
  };

  // Map columns
  const mappedIndices = {};
  rawHeaders.forEach((h, idx) => {
    const lower = h.toLowerCase().replace(/[^a-z0-9_]/g, '');
    for (const [key, variants] of Object.entries(headerMap)) {
      if (variants.some(v => v.replace(/[^a-z0-9_]/g, '') === lower) && mappedIndices[key] === undefined) {
        mappedIndices[key] = idx;
      }
    }
  });

  if (mappedIndices.term === undefined) {
    errors.push('Required header "term" not found in CSV.');
    return { headers: rawHeaders, rows: [], errors };
  }
  if (mappedIndices.definition === undefined) {
    errors.push('Required header "definition" not found in CSV.');
    return { headers: rawHeaders, rows: [], errors };
  }

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    const getVal = (key) => {
      const idx = mappedIndices[key];
      if (idx === undefined || idx >= line.length) return '';
      let val = line[idx].trim();
      // Formula injection defense (sanitize leading =, +, -, @, tab, cr)
      if (/^[=+\-@\t\r]/.test(val)) {
        val = `'${val}`;
      }
      return val;
    };

    const term = getVal('term');
    const definition = getVal('definition');
    const abbreviation = getVal('abbreviation');
    const aliases = getVal('aliases');
    const category = getVal('category');
    const resourceLabel = getVal('resourceLabel');
    const resourceUrl = getVal('resourceUrl');

    if (!term && !definition) continue; // skip blank row

    if (!term) {
      errors.push(`Row ${r + 1}: Term is required.`);
      continue;
    }
    if (!definition) {
      errors.push(`Row ${r + 1}: Definition is required for "${term}".`);
      continue;
    }

    rows.push({
      id: `gloss-csv-${r}-${Date.now().toString(36)}`,
      term,
      definition: `<p>${sanitizeRichText(definition)}</p>`,
      abbreviation,
      aliases,
      category,
      resourceLabel,
      resourceUrl: sanitizeURL(resourceUrl, { allowRelative: true })
    });
  }

  return { headers: rawHeaders, rows, errors };
}

/**
 * Creates the interactive Glossary authoring UI.
 * @param {any} config
 * @param {() => void} onUpdate
 * @returns {HTMLElement}
 */
export function createGlossaryEditor(config, onUpdate) {
  const container = document.createElement('div');
  container.className = 'ppt-tool-editor ppt-glossary-editor';

  const header = document.createElement('div');
  header.className = 'ppt-editor-header-bar';
  header.innerHTML = `
    <div class="ppt-editor-title-group">
      <h3>Persistent Glossary Terms</h3>
      <p class="field-hint">Add, manage, and import terms that learners can search and browse alphabetically throughout the course.</p>
    </div>
    <div class="ppt-editor-actions-group">
      <button type="button" class="btn btn-secondary btn-sm" id="btn-import-glossary-csv">
        <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M26 24v4H6v-4H4v4a2 2 0 002 2h20a2 2 0 002-2v-4z"/><path d="M15 3v16.17l-4.59-4.58L9 16l7 7 7-7-1.41-1.41L17 19.17V3h-2z"/></svg>
        <span>Import CSV</span>
      </button>
      <button type="button" class="btn btn-primary btn-sm" id="btn-add-glossary-term">
        <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M17 9h-2v6H9v2h6v6h2v-6h6v-2h-6z"/></svg>
        <span>Add Term</span>
      </button>
    </div>
  `;
  container.appendChild(header);

  // Hidden File input for CSV
  const csvFileInput = document.createElement('input');
  csvFileInput.type = 'file';
  csvFileInput.accept = '.csv,text/csv';
  csvFileInput.style.display = 'none';
  container.appendChild(csvFileInput);

  // Search & Filter Toolbar
  const searchBar = document.createElement('div');
  searchBar.className = 'ppt-list-filter-bar';
  searchBar.innerHTML = `
    <input type="search" class="ppt-search-input" placeholder="Search authoring terms, categories..." aria-label="Filter terms">
    <button type="button" class="btn btn-secondary btn-sm" id="btn-sort-glossary-az">Sort A–Z</button>
    <span class="ppt-item-count" id="glossary-term-count">${config.glossary.entries.length} terms</span>
  `;
  container.appendChild(searchBar);

  const termListContainer = document.createElement('div');
  termListContainer.className = 'ppt-terms-list';
  container.appendChild(termListContainer);

  function renderTermCards(filterQuery = '') {
    termListContainer.innerHTML = '';
    const query = filterQuery.toLowerCase().trim();
    const entries = config.glossary.entries;

    // Duplicate detection check
    const termOccurrences = new Map();
    entries.forEach(e => {
      const key = (e.term || '').toLowerCase().trim();
      if (key) termOccurrences.set(key, (termOccurrences.get(key) || 0) + 1);
    });

    const filtered = query
      ? entries.filter(e => (e.term + ' ' + e.abbreviation + ' ' + e.category + ' ' + e.aliases).toLowerCase().includes(query))
      : entries;

    const countEl = searchBar.querySelector('#glossary-term-count');
    if (countEl) countEl.textContent = `${entries.length} term${entries.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'ppt-empty-state';
      emptyState.innerHTML = `
        <p>No glossary terms found. Click <strong>Add Term</strong> or <strong>Import CSV</strong> to get started.</p>
      `;
      termListContainer.appendChild(emptyState);
      return;
    }

    filtered.forEach((entry) => {
      const actualIndex = entries.indexOf(entry);
      const isDuplicate = termOccurrences.get((entry.term || '').toLowerCase().trim()) > 1;

      const card = document.createElement('div');
      card.className = `ppt-entry-card ${isDuplicate ? 'ppt-card-warning' : ''}`;
      card.innerHTML = `
        <div class="ppt-card-header">
          <div class="ppt-card-title-row">
            <span class="ppt-card-index">#${actualIndex + 1}</span>
            <span class="ppt-card-term-title">${escapeHTML(entry.term || 'Untitled Term')}</span>
            ${entry.abbreviation ? `<span class="ppt-badge">${escapeHTML(entry.abbreviation)}</span>` : ''}
            ${entry.category ? `<span class="ppt-category-tag">${escapeHTML(entry.category)}</span>` : ''}
            ${isDuplicate ? `<span class="ppt-warning-badge" title="Duplicate term name detected">Duplicate Term</span>` : ''}
          </div>
          <div class="ppt-card-header-actions">
            <button type="button" class="btn-icon-sm btn-dup-term" title="Duplicate term" aria-label="Duplicate term">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M28 10V28H10V10H28ZM28 8H10C8.9 8 8 8.9 8 10V28C8 29.1 8.9 30 10 30H28C29.1 30 30 29.1 30 28V10C30 8.9 29.1 8 28 8ZM22 4H4C2.9 4 2 4.9 2 6V24H4V6H22V4Z"/></svg>
            </button>
            <button type="button" class="btn-icon-sm btn-delete-term" title="Delete term" aria-label="Delete term">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M12 12h2v12h-2zm6 0h2v12h-2z"/><path d="M4 6v2h2v20a2 2 0 002 2h16a2 2 0 002-2V8h2V6h-6V4a2 2 0 00-2-2h-8a2 2 0 00-2 2v2H4zm4 22V8h16v20H8zm4-24h8v2h-8V4z"/></svg>
            </button>
          </div>
        </div>

        <div class="ppt-card-body">
          <div class="ppt-form-grid">
            <div class="input-wrapper">
              <label>Term <span class="required">*</span></label>
              <input type="text" class="input-term-name" value="${escapeAttribute(entry.term)}" placeholder="e.g. Bandwidth">
            </div>
            <div class="input-wrapper">
              <label>Acronym / Abbreviation</label>
              <input type="text" class="input-term-abbrev" value="${escapeAttribute(entry.abbreviation || '')}" placeholder="e.g. BW">
            </div>
            <div class="input-wrapper">
              <label>Category / Topic</label>
              <input type="text" class="input-term-category" value="${escapeAttribute(entry.category || '')}" placeholder="e.g. Networking">
            </div>
            <div class="input-wrapper">
              <label>Search Aliases / Keywords</label>
              <input type="text" class="input-term-aliases" value="${escapeAttribute(entry.aliases || '')}" placeholder="comma-separated aliases">
            </div>
          </div>

          <div class="input-wrapper rte-wrapper-slot">
            <label>Definition <span class="required">*</span></label>
            <div class="rte-container-slot"></div>
          </div>

          <div class="ppt-form-grid">
            <div class="input-wrapper">
              <label>Related Resource Link URL (Optional)</label>
              <input type="url" class="input-term-res-url" value="${escapeAttribute(entry.resourceUrl || '')}" placeholder="https://...">
            </div>
            <div class="input-wrapper">
              <label>Related Resource Link Label</label>
              <input type="text" class="input-term-res-label" value="${escapeAttribute(entry.resourceLabel || '')}" placeholder="e.g. View Specification">
            </div>
          </div>
        </div>
      `;

      // Mount RTE for Definition
      const rteSlot = card.querySelector('.rte-container-slot');
      if (rteSlot) {
        const rte = createRichTextEditor({
          ariaLabel: `Definition for glossary entry ${actualIndex + 1}`,
          value: entry.definition || '',
          onChange: (sanitizedHTML) => {
            entry.definition = sanitizedHTML;
            onUpdate();
          }
        });
        rteSlot.appendChild(rte.element);
      }

      // Event listeners
      const nameInput = card.querySelector('.input-term-name');
      nameInput.addEventListener('input', () => {
        entry.term = nameInput.value;
        card.querySelector('.ppt-card-term-title').textContent = entry.term || 'Untitled Term';
        onUpdate();
      });

      const abbrevInput = card.querySelector('.input-term-abbrev');
      abbrevInput.addEventListener('input', () => {
        entry.abbreviation = abbrevInput.value;
        onUpdate();
      });

      const catInput = card.querySelector('.input-term-category');
      catInput.addEventListener('input', () => {
        entry.category = catInput.value;
        onUpdate();
      });

      const aliasInput = card.querySelector('.input-term-aliases');
      aliasInput.addEventListener('input', () => {
        entry.aliases = aliasInput.value;
        onUpdate();
      });

      const urlInput = card.querySelector('.input-term-res-url');
      urlInput.addEventListener('input', () => {
        entry.resourceUrl = urlInput.value;
        onUpdate();
      });

      const labelInput = card.querySelector('.input-term-res-label');
      labelInput.addEventListener('input', () => {
        entry.resourceLabel = labelInput.value;
        onUpdate();
      });

      card.querySelector('.btn-delete-term').addEventListener('click', () => {
        config.glossary.entries.splice(actualIndex, 1);
        renderTermCards(searchBar.querySelector('.ppt-search-input').value);
        onUpdate();
      });

      card.querySelector('.btn-dup-term').addEventListener('click', () => {
        const copy = JSON.parse(JSON.stringify(entry));
        copy.id = `gloss-${Date.now().toString(36)}`;
        copy.term = `${entry.term} (Copy)`;
        config.glossary.entries.splice(actualIndex + 1, 0, copy);
        renderTermCards(searchBar.querySelector('.ppt-search-input').value);
        onUpdate();
      });

      termListContainer.appendChild(card);
    });
  }

  // Initial render
  renderTermCards();

  // Search input event
  const searchInput = searchBar.querySelector('.ppt-search-input');
  searchInput.addEventListener('input', () => {
    renderTermCards(searchInput.value);
  });

  // Sort A-Z button
  const sortBtn = searchBar.querySelector('#btn-sort-glossary-az');
  sortBtn.addEventListener('click', () => {
    config.glossary.entries.sort((a, b) => (a.term || '').localeCompare(b.term || ''));
    renderTermCards(searchInput.value);
    onUpdate();
  });

  // Add Term Button
  header.querySelector('#btn-add-glossary-term').addEventListener('click', () => {
    config.glossary.entries.push({
      id: `gloss-${Date.now().toString(36)}`,
      term: 'New Term',
      definition: '<p>Enter definition description here.</p>',
      abbreviation: '',
      aliases: '',
      category: '',
      resourceUrl: '',
      resourceLabel: ''
    });
    renderTermCards(searchInput.value);
    onUpdate();
  });

  // Import CSV Button
  header.querySelector('#btn-import-glossary-csv').addEventListener('click', () => {
    csvFileInput.click();
  });

  csvFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseGlossaryCSV(text);
      if (result.errors.length > 0 && result.rows.length === 0) {
        alert(`CSV Import Failed:\n\n${result.errors.join('\n')}`);
        return;
      }

      config.glossary.entries.push(...result.rows);
      renderTermCards(searchInput.value);
      onUpdate();

      const summaryMsg = `Successfully imported ${result.rows.length} terms.` +
        (result.errors.length > 0 ? `\n\nWarnings/Skipped rows:\n${result.errors.join('\n')}` : '');
      alert(summaryMsg);
    } catch (err) {
      alert(`Failed to read CSV file: ${err.message}`);
    } finally {
      csvFileInput.value = '';
    }
  });

  return container;
}
