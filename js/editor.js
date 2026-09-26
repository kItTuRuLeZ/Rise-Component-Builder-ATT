import { createDefaultItem } from './editor-schemas.js';
import { formatItemLabel, sanitizeRichText } from './utilities.js';
import { isMediaReference } from './media.js';
import { createMediaUploadControl } from './media-upload.js';
import { getAccessibilityWarning, getLengthGuidance, isEmpty, validateSchemaField } from './field-validation.js';
import { createItemMediaControl } from './item-media.js';
import { createRichTextEditor } from './rich-text-editor.js';

export { validateSchemaField } from './field-validation.js';

export const supportedEditorFieldTypes = [
  'text', 'textarea', 'number', 'range', 'select', 'checkbox', 'radio',
  'color', 'url', 'image', 'audio', 'video', 'richtext'
];

export function switchEditorTab(tabId, tabs, panes) {
  const targetTabId = (tabId === 'settings' || tabId === 'behavior') ? 'interaction' : tabId;

  const tabList = tabs && tabs.length ? tabs : document.querySelectorAll('.editor-tab');
  const paneList = panes && panes.length ? panes : document.querySelectorAll('.tab-pane');

  tabList.forEach(tab => {
    const isMatch = tab.getAttribute('data-tab') === targetTabId || tab.getAttribute('data-tab') === tabId;
    tab.classList.toggle('active', isMatch);
    tab.setAttribute('aria-selected', String(isMatch));
    tab.setAttribute('tabindex', isMatch ? '0' : '-1');
  });

  paneList.forEach(pane => {
    const isMatch = pane.id === `tab-${targetTabId}` || pane.id === `tab-${tabId}`;
    pane.classList.toggle('active', isMatch);
  });
}

export function getFieldTabLocation(fieldId) {
  if (!fieldId) return 'content';
  const interactionFields = new Set([
    'accordionMulti', 'accordionAnimation', 'accordionSequential', 'accordionShowProgress',
    'accordionShowVisitedBadge', 'accordionExpandCollapseAll', 'accordionSearch', 'accordionAllowReset',
    'flipCardsMode', 'flipCardsShuffle', 'flipCardsCategories', 'flipCardsSummary', 'flipCardsReset',
    'flipCardsFrontLabel', 'flipCardsBackLabel', 'tabsSequential', 'tabsShowProgress', 'tabsShowVisitedBadge',
    'tabsCompareMode', 'tabsAllowReset', 'timelineCategories', 'timelineCompareMode', 'timelineCollapsible',
    'timelineChronological', 'timelineShowProgress', 'timelineAllowReset', 'ivResumeBehaviour', 'ivShowMarkerNav',
    'ivShowProgress', 'ivAllowRestart', 'mcConfidenceMode', 'mcRequireConfidence', 'mcConfidenceLowLabel',
    'mcConfidenceMidLabel', 'mcConfidenceHighLabel', 'mcShowResultSummary', 'mcMaxAttempts', 'mcHintText',
    'mcShowCorrectAfterFinal', 'mcFinalExplanation', 'mcAllowReset', 'pauseVideo', 'required'
  ]);
  const appearanceFields = new Set([
    'blockHeadingLevel', 'headerStyle', 'headerCyanRule', 'spacingDensity', 'contextBandEnabled',
    'contextBandText', 'contextBandAlignment', 'iconStyle', 'tabsOrientation', 'tabsNumbered',
    'textColor', 'focusRing', 'theme'
  ]);
  const completionFields = new Set([
    'trackCompletion', 'completionMode', 'completionMsg', 'ivCompletionRule', 'allowReset'
  ]);

  if (completionFields.has(fieldId)) return 'completion';
  if (appearanceFields.has(fieldId)) return 'appearance';
  if (interactionFields.has(fieldId)) return 'interaction';
  return 'content';
}

export function setupEditorTabKeyboardNavigation(tabList, paneList, onTabChange) {
  if (!tabList || !tabList.length) return;
  const tabs = Array.from(tabList);
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (e) => {
      let targetIndex = null;
      if (e.key === 'ArrowRight') targetIndex = (index + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') targetIndex = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') targetIndex = 0;
      else if (e.key === 'End') targetIndex = tabs.length - 1;

      if (targetIndex !== null) {
        e.preventDefault();
        const targetTab = tabs[targetIndex];
        const tabId = targetTab.getAttribute('data-tab');
        targetTab.focus();
        switchEditorTab(tabId, tabList, paneList);
        if (typeof onTabChange === 'function') onTabChange(tabId);
      }
    });
  });
}

export function jumpToEditorField(fieldId, itemIndex, _options = {}) {
  const targetTabId = getFieldTabLocation(fieldId);
  switchEditorTab(targetTabId);

  // If there's an itemIndex and target is in dynamic items, expand the item card if collapsed
  if (itemIndex !== undefined && itemIndex !== null && itemIndex >= 0) {
    const card = document.querySelector(`.dynamic-item-card[data-index="${itemIndex}"]`);
    if (card && (card.classList.contains('is-collapsed') || card.classList.contains('collapsed'))) {
      const toggleBtn = card.querySelector('.item-collapse-btn');
      if (toggleBtn instanceof HTMLElement) toggleBtn.click();
    }
  }

  // Find target element
  /** @type {HTMLElement|null} */
  let targetElem = null;
  if (fieldId) {
    if (itemIndex !== undefined && itemIndex !== null && itemIndex >= 0) {
      targetElem = document.querySelector(`.dynamic-item-card[data-index="${itemIndex}"] [data-field-id="${fieldId}"]`)
        || document.querySelector(`[data-field-id="${fieldId}"][data-item-index="${itemIndex}"]`)
        || document.getElementById(`schema-${itemIndex}-${fieldId}`)
        || document.getElementById(`schema-item-${itemIndex}-${fieldId}`);
    }
    if (!targetElem) {
      const kebabField = fieldId.replace(/([A-Z])/g, '-$1').toLowerCase();
      targetElem = document.querySelector(`[data-field-id="${fieldId}"]`)
        || document.getElementById(`input-${fieldId}`)
        || document.getElementById(`select-${fieldId}`)
        || document.getElementById(`input-${kebabField}`)
        || document.getElementById(`select-${kebabField}`)
        || document.getElementById(fieldId);
    }
  } else if (itemIndex !== undefined && itemIndex !== null && itemIndex >= 0) {
    const card = document.querySelector(`.dynamic-item-card[data-index="${itemIndex}"]`);
    if (card instanceof HTMLElement) {
      const btn = card.querySelector('.item-collapse-btn');
      targetElem = btn instanceof HTMLElement ? btn : card;
    }
  }

  if (targetElem) {
    targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof targetElem.focus === 'function') targetElem.focus();
    targetElem.classList.add('field-jump-highlight');
    window.setTimeout(() => {
      targetElem?.classList.remove('field-jump-highlight');
    }, 2000);
  }
}

export function addEditorItem(state, schema) {
  state.config.items.push(createDefaultItem(schema));
}

export function validateActiveComponent(state, componentRegistry) {
  const component = componentRegistry[state.selectedComponent?.id || 'accordion'];
  return component ? component.validate(state.config) : { valid: true, errors: [] };
}


function createLabel(field, controlId) {
  const label = document.createElement('label');
  label.htmlFor = controlId;
  label.textContent = field.label;
  if (field.required || field.requiredOne) {
    const required = document.createElement('span');
    required.className = 'required-indicator';
    required.textContent = ' *';
    required.setAttribute('aria-hidden', 'true');
    label.appendChild(required);
  }
  return label;
}

function setControlValue(control, field, value) {
  if (field.type === 'checkbox' || field.type === 'radio') control.checked = Boolean(value);
  else if (field.type === 'richtext') control.innerHTML = sanitizeRichText(value ?? '');
  else control.value = value ?? '';
}

function createBasicControl(field, controlId, value) {
  let control;
  if (field.type === 'textarea') {
    control = document.createElement('textarea');
  } else if (field.type === 'richtext') {
    control = document.createElement('div');
    control.className = 'schema-richtext';
    control.contentEditable = 'true';
    control.setAttribute('role', 'textbox');
    control.setAttribute('aria-multiline', 'true');
  } else if (field.type === 'select') {
    control = document.createElement('select');
    (field.options || []).forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = typeof option === 'object' ? option.value : option;
      optionElement.textContent = typeof option === 'object' ? option.label : option;
      control.appendChild(optionElement);
    });
  } else {
    control = document.createElement('input');
    control.type = field.type === 'checkbox' || field.type === 'radio' ? field.type : field.type;
    if (field.type === 'number' || field.type === 'range') {
      if (field.min !== undefined) control.min = field.min;
      if (field.max !== undefined) control.max = field.max;
      if (field.step !== undefined) control.step = field.step;
    }
    if (field.maxLength) control.maxLength = field.maxLength;
  }
  control.id = controlId;
  control.dataset.fieldId = field.id;
  setControlValue(control, field, value);
  return control;
}

export function createSchemaItemEditor({ container, onChange, focusFallback }) {
  const collapsedItems = new WeakSet();
  let draggedIndex = null;
  let fieldRegistry = [];
  // P11 focus preservation: a handler that structurally changes the item list (reorder,
  // duplicate, delete, expand/collapse) sets this right before calling render(lastRender),
  // which fully rebuilds the DOM and would otherwise silently drop focus to <body>. render()
  // consumes and clears it after rebuilding.
  let pendingFocus = null;

  function applyPendingFocus() {
    if (!pendingFocus) return;
    const { index, part } = pendingFocus;
    pendingFocus = null;
    if (part === 'fallback') { focusFallback?.focus?.(); return; }
    const card = container.querySelector(`.dynamic-item-card[data-index="${index}"]`);
    if (!card) { focusFallback?.focus?.(); return; }
    const target = part === 'heading' ? card.querySelector('.item-collapse-btn') : card.querySelector(`.item-action-btn[title="${part}"]`);
    if (target && !target.disabled) target.focus();
    else card.querySelector('.item-collapse-btn')?.focus();
  }

  function refreshDependentWarnings(model, changedFieldId) {
    fieldRegistry.forEach(entry => {
      if (entry.model !== model) return;
      const { field } = entry;
      const depends = field.warningWhen === changedFieldId
        || field.warningUnless === changedFieldId
        || (field.warningUnlessAny && field.warningUnlessAny.includes(changedFieldId));
      if (depends) entry.updateError();
    });
  }

  /**
   * @param {{ field: any, model: any, items: any, indexKey: any, target: any, onMultiple?: any, limits?: any, schema?: any }} options
   */
  function appendField({ field, model, items, indexKey, target, onMultiple, limits, schema }) {
    if (!supportedEditorFieldTypes.includes(field.type)) return;
    const wrapper = document.createElement('div');
    wrapper.className = `input-wrapper schema-field schema-field-${field.type}`;
    const controlId = `schema-${indexKey}-${field.id}`;
    const error = document.createElement('div');
    error.className = 'field-error';
    error.id = `${controlId}-error`;
    error.setAttribute('role', 'alert');
    const warning = document.createElement('div');
    warning.className = 'field-warning';
    warning.id = `${controlId}-warning`;

    const updateError = ctrl => {
      const targetControl = ctrl || control;
      const errors = validateSchemaField(field, model[field.id], items);
      const warningText = getAccessibilityWarning(field, model[field.id], model);
      error.textContent = errors[0] || '';
      warning.textContent = warningText;
      wrapper.classList.toggle('has-error', errors.length > 0);
      wrapper.classList.toggle('has-warning', Boolean(warningText));
      if (targetControl) {
        targetControl.setAttribute('aria-invalid', String(errors.length > 0));
        targetControl.setAttribute('aria-describedby', [targetControl.dataset?.guidanceId, error.id, warningText ? warning.id : ''].filter(Boolean).join(' '));
      }
    };
    const updateValue = (value, ctrl) => {
      const targetControl = ctrl || control;
      if (field.type === 'radio' && field.groupAcrossItems) items.forEach(entry => { entry[field.id] = false; });
      model[field.id] = value;
      updateError(targetControl);
      refreshDependentWarnings(model, field.id);
      onChange();
    };

    /** @type {any} control's concrete element type depends on field.type, resolved dynamically below */
    let control;
    let fieldElement;
    if (['image', 'audio', 'video'].includes(field.type) || field.uploadKind) {
      let media;
      const contextLabel = field.contextLabel || (indexKey === 'component' ? (schema?.componentLabel || field.label) : (items && items[indexKey]?.title ? `${formatItemLabel(schema, indexKey)} (${items[indexKey].title})` : `${formatItemLabel(schema, indexKey)} ${field.label}`));
      media = createMediaUploadControl({
        field, controlId, value: model[field.id], limits, contextLabel,
        onChange: value => {
          model[`${field.id}Duration`] = isMediaReference(value) && Number.isFinite(value.duration) ? value.duration : null;
          updateValue(value, media.validationControl);
        },
        onMultiple: references => {
          if (onMultiple) onMultiple(references);
          updateError(media.validationControl);
          refreshDependentWarnings(model, field.id);
          onChange();
        }
      });
      fieldElement = media.element;
      control = media.validationControl;
    } else if (field.type === 'richtext' || field.type === 'text') {
      const rte = createRichTextEditor({
        controlId,
        fieldId: field.id,
        value: model[field.id],
        isSingleLine: field.type === 'text',
        placeholder: field.placeholder || '',
        onChange: (sanitizedVal) => {
          updateValue(sanitizedVal, rte.validationControl);
        }
      });
      fieldElement = rte.element;
      control = rte.validationControl;
      control.maxLength = field.maxLength !== undefined ? field.maxLength : -1;
    } else {
      control = createBasicControl(field, controlId, model[field.id]);
      fieldElement = control;
      if (field.type === 'radio') control.name = `schema-radio-${field.id}`;
      const eventName = ['select', 'checkbox', 'radio', 'color'].includes(field.type) ? 'change' : 'input';
      control.addEventListener(eventName, () => {
        const nextValue = field.type === 'checkbox' || field.type === 'radio'
          ? control.checked
          : control.value;
        updateValue(nextValue, control);
        if (field.type === 'range') rangeValue.textContent = `${control.value}${field.suffix || ''}`;
        if (field.type === 'radio' && field.groupAcrossItems) render(lastRender);
      });
    }

    const label = createLabel(field, controlId);
    wrapper.append(label, fieldElement);

    // P11: static, non-blocking guidance for fields prone to overflowing the fixed-width
    // block layout — shown up front rather than only after the fact via the preflight
    // "excessive length" warning (js/validation.js#checkExcessiveLength, same thresholds).
    // Fields with an explicit maxLength already have a hard, save-time cap and don't need
    // this — see getLengthGuidance.
    const guidanceText = getLengthGuidance(field);
    if (guidanceText) {
      const guidance = document.createElement('p');
      guidance.className = 'field-length-guidance';
      guidance.id = `${controlId}-guidance`;
      guidance.textContent = guidanceText;
      wrapper.appendChild(guidance);
      control.dataset.guidanceId = guidance.id;
    }

    let rangeValue;
    if (field.type === 'range') {
      rangeValue = document.createElement('output');
      rangeValue.className = 'range-value';
      rangeValue.textContent = `${control.value}${field.suffix || ''}`;
      wrapper.appendChild(rangeValue);
    }

    // Phase 2.E: Live character counter for text / textarea / richtext fields.
    // Shown when the field has an explicit maxLength (hard cap) or a RECOMMENDED
    // threshold imported from js/field-validation.js (soft cap). The counter is
    // purely informational — it does NOT prevent authoring past the soft limit;
    // the Preflight "excessive-length" Warning already covers that concern.
    const charCountLimit = field.maxLength ?? field.softLimit ?? null;
    let charCounter = null;
    if (charCountLimit && ['text', 'textarea', 'richtext'].includes(field.type)) {
      charCounter = document.createElement('div');
      charCounter.className = 'field-char-counter';
      charCounter.setAttribute('aria-live', 'polite');
      charCounter.setAttribute('aria-atomic', 'true');

      const updateCharCounter = () => {
        const raw = field.type === 'richtext'
          ? (control.textContent ?? '')  // strip HTML tags for count
          : (control.value ?? '');
        const len = raw.length;
        charCounter.textContent = `${len} / ${charCountLimit}`;
        const pct = charCountLimit > 0 ? len / charCountLimit : 0;
        charCounter.classList.toggle('is-approaching', pct >= 0.8 && pct < 1);
        charCounter.classList.toggle('is-over', pct >= 1);
      };

      updateCharCounter(); // initialise from loaded model value
      const counterEvent = field.type === 'richtext' ? 'input' : 'input';
      control.addEventListener(counterEvent, updateCharCounter);
      wrapper.appendChild(charCounter);
    }

    wrapper.append(error, warning);
    target.appendChild(wrapper);
    updateError(control);
    fieldRegistry.push({ model, field, updateError: () => updateError(control) });
  }

  let lastRender = null;
  function render({ schema, items, config = {}, limits }) {
    lastRender = { schema, items, config, limits };
    fieldRegistry = [];
    container.innerHTML = '';

    if (schema.componentFields?.length) {
      const componentCard = document.createElement('section');
      componentCard.className = 'dynamic-item-card component-fields-card';
      const title = document.createElement('h3');
      title.className = 'component-fields-title';
      title.textContent = schema.componentLabel || 'Component media';
      const body = document.createElement('div');
      body.className = 'item-card-body';
      schema.componentFields.forEach(field => appendField({ field, model: config, items, indexKey: 'component', target: body, limits, schema }));
      componentCard.append(title, body);
      container.appendChild(componentCard);
    }

    if (items.length < (schema.minItems || 0)) {
      const collectionError = document.createElement('div');
      collectionError.className = 'schema-collection-error';
      collectionError.setAttribute('role', 'alert');
      collectionError.textContent = `Add at least ${schema.minItems} ${schema.itemLabel.toLowerCase()}${schema.minItems === 1 ? '' : 's'}.`;
      container.appendChild(collectionError);
    }

    items.forEach((item, index) => {
      const card = document.createElement('section');
      card.className = 'dynamic-item-card';
      card.draggable = false;
      card.dataset.index = index;
      const collapsed = collapsedItems.has(item);
      card.classList.toggle('collapsed', collapsed);

      const header = document.createElement('div');
      header.className = 'item-card-header';
      const heading = document.createElement('button');
      heading.type = 'button';
      heading.className = 'item-collapse-btn';
      const summaryField = schema.itemFields.find(schemaField => !isEmpty(item[schemaField.id]));
      const summaryValue = summaryField ? item[summaryField.id] : '';
      const summary = summaryField ? String(isMediaReference(summaryValue) ? summaryValue.name : summaryValue).replace(/\s+/g, ' ').slice(0, 48) : '';
      heading.textContent = `${collapsed ? '▸' : '▾'} ${formatItemLabel(schema, index)}${summary ? ` — ${summary}` : ''}`;
      heading.setAttribute('aria-expanded', String(!collapsed));
      heading.addEventListener('click', () => {
        if (collapsed) collapsedItems.delete(item); else collapsedItems.add(item);
        pendingFocus = { index, part: 'heading' };
        render(lastRender);
      });

      const actions = document.createElement('div');
      actions.className = 'item-card-actions';
      const addButton = (label, title, handler, disabled = false, extraClass = '') => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = extraClass ? `item-action-btn ${extraClass}` : 'item-action-btn';
        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.disabled = disabled;
        button.addEventListener('click', handler);
        actions.appendChild(button);
      };
      addButton('⠿', 'Drag to reorder', event => event.preventDefault(), false, 'drag-handle');
      addButton('↑', 'Move item up', () => { pendingFocus = { index: index - 1, part: 'Move item up' }; move(index, index - 1); }, index === 0);
      addButton('↓', 'Move item down', () => { pendingFocus = { index: index + 1, part: 'Move item down' }; move(index, index + 1); }, index === items.length - 1);
      const atMaxItems = Number.isInteger(schema.maxItems) && items.length >= schema.maxItems;
      addButton('⧉', atMaxItems ? `Only ${schema.maxItems} ${schema.itemLabel.toLowerCase()}${schema.maxItems === 1 ? '' : 's'} allowed` : 'Duplicate item', () => {
        const duplicate = structuredClone(item);
        schema.itemFields.filter(field => field.groupAcrossItems).forEach(field => { duplicate[field.id] = false; });
        items.splice(index + 1, 0, duplicate);
        pendingFocus = { index: index + 1, part: 'heading' };
        onChange();
        render(lastRender);
      }, atMaxItems);
      addButton('×', 'Delete item', () => {
        items.splice(index, 1);
        pendingFocus = items.length ? { index: Math.min(index, items.length - 1), part: 'heading' } : { part: 'fallback' };
        onChange();
        render(lastRender);
      });
      header.append(heading, actions);
      card.appendChild(header);

      const body = document.createElement('div');
      body.className = 'item-card-body';
      if (!collapsed) {
        schema.itemFields.forEach(field => {
          appendField({
            field, model: item, items, indexKey: index, target: body, limits, schema,
            onMultiple: references => {
              item[field.id] = references[0];
              item[`${field.id}Duration`] = Number.isFinite(references[0]?.duration) ? references[0].duration : null;
              references.slice(1).forEach((reference, offset) => {
                const newItem = createDefaultItem(schema);
                newItem[field.id] = reference;
                newItem[`${field.id}Duration`] = Number.isFinite(reference.duration) ? reference.duration : null;
                if ('title' in newItem) newItem.title = reference.name.replace(/\.[^.]+$/, '');
                items.splice(index + 1 + offset, 0, newItem);
              });
              render(lastRender);
            }
          });
        });

        if (schema.supportsItemMedia) {
          const itemTitle = item.title || `${formatItemLabel(schema, index)}`;
          const mediaControl = createItemMediaControl({
            item,
            index,
            itemLabel: itemTitle,
            allowedTypes: schema.itemMediaTypes || null,
            limits,
            onChange: () => {
              onChange();
            }
          });
          body.appendChild(mediaControl);
        }
      }
      card.appendChild(body);

      // The card is only made a native drag source (`draggable`) while a
      // gesture that began on the `.drag-handle` button is in progress.
      // Leaving `draggable` on at all times causes browsers to start
      // tracking a potential native drag on ANY mousedown over the card,
      // which competes with and interrupts interactive children (range
      // sliders, inputs) even when `dragstart` itself is later cancelled.
      card.addEventListener('mousedown', event => {
        card.draggable = Boolean(/** @type {Element} */ (event.target)?.closest('.drag-handle'));
      });
      card.addEventListener('mouseup', () => { card.draggable = false; });
      card.addEventListener('dragstart', event => {
        draggedIndex = index;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
      card.addEventListener('drop', event => {
        event.preventDefault();
        if (draggedIndex !== null && draggedIndex !== index) move(draggedIndex, index);
      });
      card.addEventListener('dragend', () => { draggedIndex = null; card.classList.remove('dragging'); card.draggable = false; });

      // Keyboard shortcuts for item reordering, duplicating, and deleting
      card.addEventListener('keydown', event => {
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'Up')) {
          event.preventDefault();
          if (index > 0) {
            pendingFocus = { index: index - 1, part: 'Move item up' };
            move(index, index - 1);
          }
        } else if (event.altKey && (event.key === 'ArrowDown' || event.key === 'Down')) {
          event.preventDefault();
          if (index < items.length - 1) {
            pendingFocus = { index: index + 1, part: 'Move item down' };
            move(index, index + 1);
          }
        } else if (event.altKey && (event.key === 'd' || event.key === 'D')) {
          event.preventDefault();
          if (!atMaxItems) {
            const duplicate = structuredClone(item);
            schema.itemFields.filter(field => field.groupAcrossItems).forEach(field => { duplicate[field.id] = false; });
            items.splice(index + 1, 0, duplicate);
            pendingFocus = { index: index + 1, part: 'heading' };
            onChange();
            render(lastRender);
          }
        } else if (event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) {
          event.preventDefault();
          items.splice(index, 1);
          pendingFocus = items.length ? { index: Math.min(index, items.length - 1), part: 'heading' } : { part: 'fallback' };
          onChange();
          render(lastRender);
        }
      });

      container.appendChild(card);
    });

    applyPendingFocus();
  }

  function move(from, to) {
    const { items } = lastRender;
    if (to < 0 || to >= items.length || from === to) return;
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    onChange();
    render(lastRender);
  }

  // P11 Requirement 1: a freshly-loaded item list (new component selection, or a saved
  // project just opened) starts with only the first item expanded — long lists of already-
  // open editors are exactly the "excess scrolling" problem this prompt targets. Call this
  // once, right before the first render() of a newly-populated items array; do NOT call it
  // from render() itself or from any other re-render path (edits, add/duplicate, settings
  // save), or it would keep stomping on choices the user already made this session.
  function resetToDefaultCollapse(items) {
    items.forEach((item, index) => { if (index === 0) collapsedItems.delete(item); else collapsedItems.add(item); });
  }

  // P11 Requirement 2: keyboard-accessible bulk expand/collapse, near the item list.
  function expandAll() {
    if (!lastRender) return;
    lastRender.items.forEach(item => collapsedItems.delete(item));
    render(lastRender);
  }
  function collapseAll() {
    if (!lastRender) return;
    lastRender.items.forEach(item => collapsedItems.add(item));
    render(lastRender);
  }

  // Updates just the item-card issue badges in place, without rebuilding the item
  // list — safe to call on every keystroke (unlike render(), which would otherwise
  // need to run on every change to keep badges live, and would drop focus/collapsed
  // state mid-edit). See docs/VALIDATION-RULES.md "Where preflight results appear".
  function refreshIssueBadges(issuesByItem) {
    container.querySelectorAll('.dynamic-item-card[data-index]').forEach(card => {
      const index = Number(card.dataset.index);
      const heading = card.querySelector('.item-collapse-btn');
      if (!heading) return;
      const existing = heading.querySelector('.item-issue-badge');
      const entry = issuesByItem?.get(index);
      if (!entry || (!entry.blocking && !entry.warning)) {
        existing?.remove();
        return;
      }
      const badge = existing || document.createElement('span');
      const count = entry.blocking + entry.warning;
      badge.className = `item-issue-badge ${entry.blocking ? 'is-blocking' : 'is-warning'}`;
      badge.textContent = String(count);
      badge.setAttribute('aria-label', `${count} preflight issue${count === 1 ? '' : 's'} for this item`);
      if (!existing) heading.appendChild(badge);
    });
  }

  return { render, refreshIssueBadges, resetToDefaultCollapse, expandAll, collapseAll };
}
