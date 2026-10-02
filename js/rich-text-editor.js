// @ts-nocheck
import { sanitizeRichText } from './utilities.js';

export const ATT_BRAND_COLORS = [
  { name: 'AT&T Blue', hex: '#0057B8' },
  { name: 'AT&T Navy', hex: '#00388F' },
  { name: 'AT&T Cyan', hex: '#009FDB' },
  { name: 'Charcoal', hex: '#111827' },
  { name: 'Muted Gray', hex: '#6B7280' },
  { name: 'Alert Red', hex: '#DA291C' },
  { name: 'Success Green', hex: '#00873D' },
  { name: 'Warm Orange', hex: '#FF7300' },
  { name: 'Deep Violet', hex: '#6B3FA0' }
];

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow Glow', hex: '#FFF3CD' },
  { name: 'Cyan Tint', hex: '#E0F7FA' },
  { name: 'Green Tint', hex: '#D4EDDA' },
  { name: 'Orange Tint', hex: '#FFE8D6' },
  { name: 'Pink Tint', hex: '#F8D7DA' }
];

export const FONT_SIZES = [
  { label: 'Small (13px)', size: '13px' },
  { label: 'Normal (16px)', size: '16px' },
  { label: 'Medium (18px)', size: '18px' },
  { label: 'Large (22px)', size: '22px' },
  { label: 'X-Large (26px)', size: '26px' },
  { label: 'XX-Large (32px)', size: '32px' }
];

export const LINE_HEIGHTS = [
  { label: 'Tight (1.1)', height: '1.1' },
  { label: 'Compact (1.3)', height: '1.3' },
  { label: 'Normal (1.5)', height: '1.5' },
  { label: 'Relaxed (1.8)', height: '1.8' },
  { label: 'Loose (2.0)', height: '2.0' }
];

export const LETTER_SPACINGS = [
  { label: 'Tight (-0.5px)', spacing: '-0.5px' },
  { label: 'Normal (0px)', spacing: '0px' },
  { label: 'Wide (1px)', spacing: '1px' },
  { label: 'Wider (2px)', spacing: '2px' }
];

/**
 * Propagates inner styled text properties to enclosing <li> elements so bullet markers match text formatting.
 * @param {HTMLElement} editorEl 
 */
export function syncListBulletStyles(editorEl) {
  if (!editorEl) return;
  const listItems = editorEl.querySelectorAll('li');
  listItems.forEach(li => {
    const styledChild = li.querySelector('span[style], p[style], strong[style], em[style], [style]');
    if (styledChild) {
      if (styledChild.style.color && !li.style.color) li.style.color = styledChild.style.color;
      if (styledChild.style.fontSize && !li.style.fontSize) li.style.fontSize = styledChild.style.fontSize;
      if (styledChild.style.lineHeight && !li.style.lineHeight) li.style.lineHeight = styledChild.style.lineHeight;
      if (styledChild.style.letterSpacing && !li.style.letterSpacing) li.style.letterSpacing = styledChild.style.letterSpacing;
      if (styledChild.style.fontWeight && !li.style.fontWeight) li.style.fontWeight = styledChild.style.fontWeight;
      if (styledChild.style.fontStyle && !li.style.fontStyle) li.style.fontStyle = styledChild.style.fontStyle;
    }
  });
}

/**
 * Executes a formatting action on the current DOM selection or applies custom style wrapper.
 * @param {string} command - execCommand name or custom action
 * @param {string} [value] - optional parameter value
 * @param {HTMLElement} [editorEl] - the contentEditable element
 */
export function executeFormatting(command, value = null, editorEl = null) {
  if (editorEl) editorEl.focus();

  if (command === 'fontSizeStyle' && value) {
    applyInlineStyle('font-size', value, editorEl);
  } else if (command === 'lineHeightStyle' && value) {
    applyInlineStyle('line-height', value, editorEl);
  } else if (command === 'letterSpacingStyle' && value) {
    applyInlineStyle('letter-spacing', value, editorEl);
  } else if (command === 'textColor' && value) {
    applyInlineStyle('color', value, editorEl);
  } else if (command === 'highlightColor' && value) {
    applyInlineStyle('background-color', value, editorEl);
  } else if (command === 'clearHighlight') {
    applyInlineStyle('background-color', 'transparent', editorEl);
  } else if (command === 'formatBlock' && value) {
    document.execCommand('formatBlock', false, value);
  } else {
    document.execCommand(command, false, value);
    if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
      syncListBulletStyles(editorEl);
    }
  }
}

/**
 * Wraps selection in a span with inline style or updates existing parent span.
 * Also synchronizes style with enclosing <li> elements so bullet markers inherit formatting.
 * @param {string} property 
 * @param {string} value 
 * @param {HTMLElement} [editorEl] 
 */
export function applyInlineStyle(property, value, editorEl) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);

  // Sync to enclosing <li> if inside a list
  let node = range.commonAncestorContainer;
  while (node && node !== editorEl) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'li') {
      node.style[property] = value;
      break;
    }
    node = node.parentNode;
  }

  if (range.collapsed) {
    // If no text is selected, create an empty styled span and place cursor inside
    const span = document.createElement('span');
    span.style[property] = value;
    span.innerHTML = '&#8203;'; // Zero-width space
    range.insertNode(span);
    range.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  // Extract selected contents
  const fragment = range.extractContents();
  const span = document.createElement('span');
  span.style[property] = value;
  span.appendChild(fragment);
  range.insertNode(span);

  // Restore selection around the newly wrapped node
  range.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(range);

  if (editorEl) syncListBulletStyles(editorEl);
}

let labelIdCounter = 0;
let editorInstanceCounter = 0;

/**
 * Names a rich-text editor from its visible `<label>`.
 *
 * The editor is a `<div contenteditable role="textbox">`, and a `<label for="…">` only reaches
 * labelable form controls (input, textarea, select, …), so the label that sits right above it
 * gave it no accessible name at all. This points the textbox at the label with
 * `aria-labelledby` and makes a click on the label focus the editor, as it would a native input.
 * An explicit `aria-label` / `aria-labelledby` already on the control wins.
 *
 * @param {HTMLElement | null | undefined} control the editor element (`validationControl`)
 * @param {HTMLElement | null | undefined} label the visible label
 */
export function labelRichTextControl(control, label) {
  if (!control || !label) return;
  if (!label.id) {
    labelIdCounter += 1;
    label.id = control.id ? `${control.id}-label` : `rte-label-${labelIdCounter}`;
  }
  if (!control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
    control.setAttribute('aria-labelledby', label.id);
  }
  if (label.dataset.focusesEditor !== 'true') {
    label.dataset.focusesEditor = 'true';
    label.addEventListener('click', () => control.focus());
  }
}

/**
 * Creates an accessible rich text formatting toolbar and contentEditable editor.
 * @param {Object} options
 * @param {string} options.controlId - Unique ID for the editor element
 * @param {string} options.fieldId - ID of the field in state/schema
 * @param {string} [options.value=''] - Initial HTML or plain text value
 * @param {string} [options.placeholder=''] - Placeholder text
 * @param {boolean} [options.isSingleLine=false] - Whether to restrict multi-paragraph features
 * @param {(val: string) => void} options.onChange - Change listener callback
 * @returns {{ element: HTMLElement, validationControl: HTMLElement, getValue: () => string, setValue: (val: string) => void }}
 */
export function createRichTextEditor({
  controlId,
  fieldId,
  value = '',
  placeholder = '',
  isSingleLine = false,
  ariaDescribedBy = '',
  ariaLabelledBy = '',
  ariaLabel = '',
  onChange
}) {
  // Ids inside the toolbar are built from this. Editors created without a controlId (the Post-Publish
  // editors) all produced "…-undefined", a duplicate id repeated on every such editor on the page.
  editorInstanceCounter += 1;
  const idSuffix = controlId || `rte-${editorInstanceCounter}`;
  const container = document.createElement('div');
  container.className = `rich-text-editor-container ${isSingleLine ? 'is-single-line' : ''}`;

  // 1. Toolbar Shell
  const toolbar = document.createElement('div');
  toolbar.className = 'rich-text-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Formatting tools');

  // Editable area reference
  const editor = document.createElement('div');
  if (controlId) editor.id = controlId;
  if (fieldId) editor.dataset.fieldId = fieldId;
  editor.className = 'schema-richtext rich-text-contenteditable';
  editor.contentEditable = 'true';
  editor.setAttribute('contenteditable', 'true');
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', isSingleLine ? 'false' : 'true');
  if (placeholder) editor.dataset.placeholder = placeholder;
  if (ariaDescribedBy) editor.setAttribute('aria-describedby', ariaDescribedBy);
  if (ariaLabelledBy) editor.setAttribute('aria-labelledby', ariaLabelledBy);
  if (ariaLabel) editor.setAttribute('aria-label', ariaLabel);
  editor.maxLength = -1;
  editor.innerHTML = sanitizeRichText(value || '');

  // Define value property proxy for seamless compatibility
  Object.defineProperty(editor, 'value', {
    get() {
      return sanitizeRichText(editor.innerHTML);
    },
    set(newVal) {
      editor.innerHTML = sanitizeRichText(newVal || '');
    },
    configurable: true
  });

  let activePopover = null;

  function closePopovers() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target instanceof Node && !container.contains(e.target)) {
      closePopovers();
    }
  });

  function createToolbarButton(label, title, iconHtml, onClick, isToggle = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rt-btn';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    if (isToggle) btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = iconHtml;

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Keep focus inside editor
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closePopovers();
      onClick(btn, e);
      editor.focus();
      triggerChange();
    });

    return btn;
  }

  let isTriggering = false;
  function triggerChange() {
    if (isTriggering) return;
    isTriggering = true;
    try {
      syncListBulletStyles(editor);
      const rawHTML = editor.innerHTML;
      const sanitized = sanitizeRichText(rawHTML);
      if (typeof onChange === 'function') onChange(sanitized);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      isTriggering = false;
    }
  }

  // --- Toolbar Items ---

  // Bold
  const boldBtn = createToolbarButton(
    'Bold', 'Bold (Ctrl+B)',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>',
    () => executeFormatting('bold', null, editor),
    true
  );
  toolbar.appendChild(boldBtn);

  // Italic
  const italicBtn = createToolbarButton(
    'Italic', 'Italic (Ctrl+I)',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>',
    () => executeFormatting('italic', null, editor),
    true
  );
  toolbar.appendChild(italicBtn);

  let underlineBtn = null;
  if (!isSingleLine) {
    // Underline
    underlineBtn = createToolbarButton(
      'Underline', 'Underline (Ctrl+U)',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path><line x1="4" y1="21" x2="20" y2="21"></line></svg>',
      () => executeFormatting('underline', null, editor),
      true
    );
    toolbar.appendChild(underlineBtn);
  }

  // Hyperlink Popover & Action
  const linkWrapper = document.createElement('div');
  linkWrapper.className = 'rt-dropdown-wrapper';

  function getSurroundingAnchor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node = sel.anchorNode;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'a') {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function openLinkPopover() {
    if (activePopover && activePopover.dataset.popoverType === 'link') {
      closePopovers();
      return;
    }
    closePopovers();

    const existingAnchor = getSurroundingAnchor();
    const sel = window.getSelection();
    let savedRange = null;
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }

    const initialHref = existingAnchor ? existingAnchor.getAttribute('href') || '' : '';
    const initialText = existingAnchor
      ? existingAnchor.textContent
      : (savedRange ? savedRange.toString() : '');
    const initialNewTab = existingAnchor
      ? existingAnchor.getAttribute('target') === '_blank'
      : true;

    const popover = document.createElement('div');
    popover.className = 'rt-popover rt-link-popover';
    popover.dataset.popoverType = 'link';

    const heading = document.createElement('div');
    heading.className = 'rt-popover-heading';
    heading.textContent = existingAnchor ? 'Edit Hyperlink' : 'Insert Hyperlink';
    popover.appendChild(heading);

    // URL Field
    const urlGroup = document.createElement('div');
    urlGroup.className = 'rt-link-field-group';
    const urlLabel = document.createElement('label');
    urlLabel.className = 'rt-link-field-label';
    urlLabel.textContent = 'Link URL:';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'rt-link-input';
    urlInput.placeholder = 'https://example.com or mailto:...';
    urlInput.value = initialHref;
    urlGroup.append(urlLabel, urlInput);
    popover.appendChild(urlGroup);

    // Text Field
    const textGroup = document.createElement('div');
    textGroup.className = 'rt-link-field-group';
    const textLabel = document.createElement('label');
    textLabel.className = 'rt-link-field-label';
    textLabel.textContent = 'Display Text:';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'rt-link-input';
    textInput.placeholder = 'Text to display';
    textInput.value = initialText;
    textGroup.append(textLabel, textInput);
    popover.appendChild(textGroup);

    // Target Checkbox
    const targetGroup = document.createElement('label');
    targetGroup.className = 'rt-link-checkbox-label';
    const targetCheckbox = document.createElement('input');
    targetCheckbox.type = 'checkbox';
    targetCheckbox.checked = initialNewTab;
    const targetSpan = document.createElement('span');
    targetSpan.textContent = 'Open in new tab';
    targetGroup.append(targetCheckbox, targetSpan);
    popover.appendChild(targetGroup);

    // Actions Row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'rt-link-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'rt-link-btn rt-link-btn-save';
    saveBtn.textContent = existingAnchor ? 'Update' : 'Add Link';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      let rawUrl = urlInput.value.trim();
      if (!rawUrl) {
        urlInput.focus();
        return;
      }

      if (!/^(?:https?:\/\/|mailto:|tel:|#|\/)/i.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }

      const displayText = textInput.value.trim() || rawUrl;
      const isNewTab = targetCheckbox.checked;

      if (existingAnchor) {
        existingAnchor.setAttribute('href', rawUrl);
        if (isNewTab) {
          existingAnchor.setAttribute('target', '_blank');
          existingAnchor.setAttribute('rel', 'noopener noreferrer');
        } else {
          existingAnchor.removeAttribute('target');
          existingAnchor.removeAttribute('rel');
        }
        if (textInput.value.trim() && textInput.value.trim() !== existingAnchor.textContent) {
          existingAnchor.textContent = textInput.value.trim();
        }
      } else {
        if (savedRange) {
          const currentSel = window.getSelection();
          currentSel.removeAllRanges();
          currentSel.addRange(savedRange);
        }

        const a = document.createElement('a');
        a.setAttribute('href', rawUrl);
        if (isNewTab) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }

        if (!savedRange || savedRange.collapsed) {
          a.textContent = displayText;
          if (savedRange) {
            savedRange.insertNode(a);
            savedRange.setStartAfter(a);
            savedRange.collapse(true);
          } else {
            editor.appendChild(a);
          }
        } else {
          const fragment = savedRange.extractContents();
          if (textInput.value.trim() && textInput.value.trim() !== fragment.textContent) {
            a.textContent = textInput.value.trim();
          } else {
            a.appendChild(fragment);
          }
          savedRange.insertNode(a);
        }
      }

      closePopovers();
      editor.focus();
      triggerChange();
    });
    actionsRow.appendChild(saveBtn);

    if (existingAnchor) {
      const unlinkBtn = document.createElement('button');
      unlinkBtn.type = 'button';
      unlinkBtn.className = 'rt-link-btn rt-link-btn-danger';
      unlinkBtn.textContent = 'Remove';
      unlinkBtn.title = 'Remove link';
      unlinkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        existingAnchor.replaceWith(...existingAnchor.childNodes);
        closePopovers();
        editor.focus();
        triggerChange();
      });
      actionsRow.appendChild(unlinkBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'rt-link-btn rt-link-btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closePopovers();
      editor.focus();
    });
    actionsRow.appendChild(cancelBtn);

    popover.appendChild(actionsRow);

    popover.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopovers();
        editor.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
    });

    linkWrapper.appendChild(popover);
    activePopover = popover;
    setTimeout(() => urlInput.focus(), 50);
  }

  const linkBtn = createToolbarButton(
    'Hyperlink', 'Insert or Edit Link (Ctrl+K)',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
    () => openLinkPopover(),
    true
  );
  linkWrapper.appendChild(linkBtn);
  toolbar.appendChild(linkWrapper);

  // Lists (Bullet & Numbered) - for body fields
  if (!isSingleLine) {
    const sepLists = document.createElement('span');
    sepLists.className = 'rt-separator';
    toolbar.appendChild(sepLists);

    const bulletBtn = createToolbarButton(
      'Bullet List', 'Bullet List',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
      () => {
        executeFormatting('insertUnorderedList', null, editor);
        syncListBulletStyles(editor);
      }
    );
    toolbar.appendChild(bulletBtn);

    const numberBtn = createToolbarButton(
      'Numbered List', 'Numbered List',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>',
      () => {
        executeFormatting('insertOrderedList', null, editor);
        syncListBulletStyles(editor);
      }
    );
    toolbar.appendChild(numberBtn);
  }

  // Text Alignment Popover
  const sepAlign = document.createElement('span');
  sepAlign.className = 'rt-separator';
  toolbar.appendChild(sepAlign);

  const alignWrapper = document.createElement('div');
  alignWrapper.className = 'rt-dropdown-wrapper';
  const alignBtn = createToolbarButton(
    'Align', 'Text Alignment',
    '<span class="rt-btn-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="15" y1="12" x2="3" y2="12"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg> <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></span>',
    () => {
      if (activePopover && activePopover.dataset.popoverType === 'align') {
        closePopovers();
        return;
      }
      closePopovers();
      const popover = document.createElement('div');
      popover.className = 'rt-popover rt-align-popover';
      popover.dataset.popoverType = 'align';

      const alignments = [
        { label: 'Align Left', cmd: 'justifyLeft' },
        { label: 'Align Center', cmd: 'justifyCenter' },
        { label: 'Align Right', cmd: 'justifyRight' },
        { label: 'Justify', cmd: 'justifyFull' }
      ];

      alignments.forEach(al => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'rt-menu-item';
        item.textContent = al.label;
        item.addEventListener('mousedown', e => e.preventDefault());
        item.addEventListener('click', () => {
          executeFormatting(al.cmd, null, editor);
          closePopovers();
          triggerChange();
        });
        popover.appendChild(item);
      });

      alignWrapper.appendChild(popover);
      activePopover = popover;
    }
  );
  alignWrapper.appendChild(alignBtn);
  toolbar.appendChild(alignWrapper);

  // Separator & Clear Formatting
  const sepClear = document.createElement('span');
  sepClear.className = 'rt-separator';
  toolbar.appendChild(sepClear);

  const clearBtn = createToolbarButton(
    'Clear Formatting', 'Clear Formatting (Reset text styles)',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    () => {
      executeFormatting('removeFormat', null, editor);
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node !== editor) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'li') {
            node.removeAttribute('style');
            break;
          }
          node = node.parentNode;
        }
      }
    }
  );
  toolbar.appendChild(clearBtn);

  // Advanced formatting elements (only for body fields)
  let strikeBtn = null;
  let subBtn = null;
  let supBtn = null;
  let advancedToolbar = null;

  if (!isSingleLine) {
    advancedToolbar = document.createElement('div');
    advancedToolbar.className = 'rt-advanced-toolbar';
    advancedToolbar.style.display = 'none';

    // Strikethrough
    strikeBtn = createToolbarButton(
      'Strikethrough', 'Strikethrough',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4H9a3 3 0 0 0-2.83 4"></path><path d="M14 12a4 4 0 0 1 0 8H6"></path><line x1="4" y1="12" x2="20" y2="12"></line></svg>',
      () => executeFormatting('strikeThrough', null, editor),
      true
    );
    advancedToolbar.appendChild(strikeBtn);

    // Subscript
    subBtn = createToolbarButton(
      'Subscript', 'Subscript',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 5 8 8"></path><path d="m12 5-8 8"></path><path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"></path></svg>',
      () => executeFormatting('subscript', null, editor),
      true
    );
    advancedToolbar.appendChild(subBtn);

    // Superscript
    supBtn = createToolbarButton(
      'Superscript', 'Superscript',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 19 8-8"></path><path d="m12 19-8-8"></path><path d="M20 11h-4c0-1.5.44-2 1.5-2.5S20 7.33 20 6c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"></path></svg>',
      () => executeFormatting('superscript', null, editor),
      true
    );
    advancedToolbar.appendChild(supBtn);

    const advSep1 = document.createElement('span');
    advSep1.className = 'rt-separator';
    advancedToolbar.appendChild(advSep1);

    // Font Size Dropdown Popover
    const sizeWrapper = document.createElement('div');
    sizeWrapper.className = 'rt-dropdown-wrapper';
    const sizeBtn = createToolbarButton(
      'Font Size', 'Font Size',
      '<span class="rt-btn-text">Size <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></span>',
      () => {
        if (activePopover && activePopover.dataset.popoverType === 'size') {
          closePopovers();
          return;
        }
        closePopovers();
        const popover = document.createElement('div');
        popover.className = 'rt-popover rt-size-popover';
        popover.dataset.popoverType = 'size';
        
        FONT_SIZES.forEach(fs => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'rt-menu-item';
          item.textContent = fs.label;
          item.addEventListener('mousedown', e => e.preventDefault());
          item.addEventListener('click', () => {
            executeFormatting('fontSizeStyle', fs.size, editor);
            closePopovers();
            triggerChange();
          });
          popover.appendChild(item);
        });

        const resetItem = document.createElement('button');
        resetItem.type = 'button';
        resetItem.className = 'rt-menu-item rt-menu-reset';
        resetItem.textContent = 'Default Size';
        resetItem.addEventListener('mousedown', e => e.preventDefault());
        resetItem.addEventListener('click', () => {
          executeFormatting('fontSizeStyle', 'inherit', editor);
          closePopovers();
          triggerChange();
        });
        popover.appendChild(resetItem);

        sizeWrapper.appendChild(popover);
        activePopover = popover;
      }
    );
    sizeWrapper.appendChild(sizeBtn);
    advancedToolbar.appendChild(sizeWrapper);

    // Line Height Dropdown Popover
    const lhWrapper = document.createElement('div');
    lhWrapper.className = 'rt-dropdown-wrapper';
    const lhBtn = createToolbarButton(
      'Line Height', 'Line Height / Spacing',
      '<span class="rt-btn-text">Line <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></span>',
      () => {
        if (activePopover && activePopover.dataset.popoverType === 'lineHeight') {
          closePopovers();
          return;
        }
        closePopovers();
        const popover = document.createElement('div');
        popover.className = 'rt-popover rt-size-popover';
        popover.dataset.popoverType = 'lineHeight';

        LINE_HEIGHTS.forEach(lh => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'rt-menu-item';
          item.textContent = lh.label;
          item.addEventListener('mousedown', e => e.preventDefault());
          item.addEventListener('click', () => {
            executeFormatting('lineHeightStyle', lh.height, editor);
            closePopovers();
            triggerChange();
          });
          popover.appendChild(item);
        });

        const resetItem = document.createElement('button');
        resetItem.type = 'button';
        resetItem.className = 'rt-menu-item rt-menu-reset';
        resetItem.textContent = 'Default Height';
        resetItem.addEventListener('mousedown', e => e.preventDefault());
        resetItem.addEventListener('click', () => {
          executeFormatting('lineHeightStyle', 'inherit', editor);
          closePopovers();
          triggerChange();
        });
        popover.appendChild(resetItem);

        lhWrapper.appendChild(popover);
        activePopover = popover;
      }
    );
    lhWrapper.appendChild(lhBtn);
    advancedToolbar.appendChild(lhWrapper);

    // Letter Spacing Dropdown Popover
    const spacingWrapper = document.createElement('div');
    spacingWrapper.className = 'rt-dropdown-wrapper';
    const spacingBtn = createToolbarButton(
      'Letter Spacing', 'Letter Spacing',
      '<span class="rt-btn-text">Spacing <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></span>',
      () => {
        if (activePopover && activePopover.dataset.popoverType === 'letterSpacing') {
          closePopovers();
          return;
        }
        closePopovers();
        const popover = document.createElement('div');
        popover.className = 'rt-popover rt-size-popover';
        popover.dataset.popoverType = 'letterSpacing';

        LETTER_SPACINGS.forEach(ls => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'rt-menu-item';
          item.textContent = ls.label;
          item.addEventListener('mousedown', e => e.preventDefault());
          item.addEventListener('click', () => {
            executeFormatting('letterSpacingStyle', ls.spacing, editor);
            closePopovers();
            triggerChange();
          });
          popover.appendChild(item);
        });

        const resetItem = document.createElement('button');
        resetItem.type = 'button';
        resetItem.className = 'rt-menu-item rt-menu-reset';
        resetItem.textContent = 'Default Spacing';
        resetItem.addEventListener('mousedown', e => e.preventDefault());
        resetItem.addEventListener('click', () => {
          executeFormatting('letterSpacingStyle', 'inherit', editor);
          closePopovers();
          triggerChange();
        });
        popover.appendChild(resetItem);

        spacingWrapper.appendChild(popover);
        activePopover = popover;
      }
    );
    spacingWrapper.appendChild(spacingBtn);
    advancedToolbar.appendChild(spacingWrapper);

    const advSep2 = document.createElement('span');
    advSep2.className = 'rt-separator';
    advancedToolbar.appendChild(advSep2);

    // Text Color Popover
    const colorWrapper = document.createElement('div');
    colorWrapper.className = 'rt-dropdown-wrapper';
    const colorBtn = createToolbarButton(
      'Text Color', 'Text Color',
      '<span class="rt-btn-color-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16"></path><path d="m6 16 6-12 6 12"></path><path d="M8 12h8"></path></svg><span class="rt-color-bar" id="rt-color-indicator-' + idSuffix + '"></span></span>',
      () => {
        if (activePopover && activePopover.dataset.popoverType === 'color') {
          closePopovers();
          return;
        }
        closePopovers();
        const popover = document.createElement('div');
        popover.className = 'rt-popover rt-color-popover';
        popover.dataset.popoverType = 'color';

        const title = document.createElement('div');
        title.className = 'rt-popover-heading';
        title.textContent = 'Text Color';
        popover.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'rt-color-grid';
        ATT_BRAND_COLORS.forEach(c => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'rt-color-swatch';
          swatch.style.backgroundColor = c.hex;
          swatch.title = `${c.name} (${c.hex})`;
          swatch.setAttribute('aria-label', `${c.name} (${c.hex})`);
          swatch.addEventListener('mousedown', e => e.preventDefault());
          swatch.addEventListener('click', () => {
            executeFormatting('textColor', c.hex, editor);
            closePopovers();
            triggerChange();
          });
          grid.appendChild(swatch);
        });
        popover.appendChild(grid);

        // Custom color row
        const customRow = document.createElement('div');
        customRow.className = 'rt-custom-color-row';
        const customLabel = document.createElement('label');
        customLabel.textContent = 'Custom:';
        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.className = 'rt-color-input';
        customInput.value = '#0057B8';
        customInput.addEventListener('input', () => {
          executeFormatting('textColor', customInput.value, editor);
          triggerChange();
        });
        customRow.append(customLabel, customInput);
        popover.appendChild(customRow);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'rt-menu-item rt-menu-reset';
        resetBtn.textContent = 'Default Color';
        resetBtn.addEventListener('mousedown', e => e.preventDefault());
        resetBtn.addEventListener('click', () => {
          executeFormatting('textColor', 'inherit', editor);
          closePopovers();
          triggerChange();
        });
        popover.appendChild(resetBtn);

        colorWrapper.appendChild(popover);
        activePopover = popover;
      }
    );
    colorWrapper.appendChild(colorBtn);
    advancedToolbar.appendChild(colorWrapper);

    // Highlight / Background Color Popover
    const highlightWrapper = document.createElement('div');
    highlightWrapper.className = 'rt-dropdown-wrapper';
    const highlightBtn = createToolbarButton(
      'Highlight', 'Text Highlight Color',
      '<span class="rt-btn-color-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h3l6-6"></path><path d="m22 2-4.5 4.5"></path><path d="m14 6 4 4"></path></svg><span class="rt-color-bar rt-highlight-bar"></span></span>',
      () => {
        if (activePopover && activePopover.dataset.popoverType === 'highlight') {
          closePopovers();
          return;
        }
        closePopovers();
        const popover = document.createElement('div');
        popover.className = 'rt-popover rt-color-popover';
        popover.dataset.popoverType = 'highlight';

        const title = document.createElement('div');
        title.className = 'rt-popover-heading';
        title.textContent = 'Highlight Color';
        popover.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'rt-color-grid';
        HIGHLIGHT_COLORS.forEach(c => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'rt-color-swatch';
          swatch.style.backgroundColor = c.hex;
          swatch.title = `${c.name} (${c.hex})`;
          swatch.setAttribute('aria-label', `${c.name} (${c.hex})`);
          swatch.addEventListener('mousedown', e => e.preventDefault());
          swatch.addEventListener('click', () => {
            executeFormatting('highlightColor', c.hex, editor);
            closePopovers();
            triggerChange();
          });
          grid.appendChild(swatch);
        });
        popover.appendChild(grid);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'rt-menu-item rt-menu-reset';
        resetBtn.textContent = 'Clear Highlight';
        resetBtn.addEventListener('mousedown', e => e.preventDefault());
        resetBtn.addEventListener('click', () => {
          executeFormatting('clearHighlight', null, editor);
          closePopovers();
          triggerChange();
        });
        popover.appendChild(resetBtn);

        highlightWrapper.appendChild(popover);
        activePopover = popover;
      }
    );
    highlightWrapper.appendChild(highlightBtn);
    advancedToolbar.appendChild(highlightWrapper);

    // Advanced disclosure button on primary toolbar
    const advToggleBtn = createToolbarButton(
      'Advanced', 'More formatting options (Font size, colors, subscript...)',
      '<span class="rt-btn-text"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg> Advanced</span>',
      () => {
        const isHidden = advancedToolbar.style.display === 'none';
        advancedToolbar.style.display = isHidden ? 'flex' : 'none';
        advToggleBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        advToggleBtn.classList.toggle('is-active', isHidden);
      }
    );
    advToggleBtn.classList.add('rt-btn-advanced');
    advToggleBtn.setAttribute('aria-expanded', 'false');
    toolbar.appendChild(advToggleBtn);
  }

  // 2. Editor Event Handlers
  editor.addEventListener('input', () => {
    triggerChange();
  });

  editor.addEventListener('keydown', (e) => {
    if (isSingleLine && e.key === 'Enter') {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        executeFormatting('bold', null, editor);
        triggerChange();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        executeFormatting('italic', null, editor);
        triggerChange();
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        executeFormatting('underline', null, editor);
        triggerChange();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        openLinkPopover();
      }
    }
  });

  // Track active selection state for toolbar buttons
  function updateToolbarState() {
    try {
      if (boldBtn) boldBtn.classList.toggle('is-active', document.queryCommandState('bold'));
      if (italicBtn) italicBtn.classList.toggle('is-active', document.queryCommandState('italic'));
      if (underlineBtn) underlineBtn.classList.toggle('is-active', document.queryCommandState('underline'));
      if (strikeBtn) strikeBtn.classList.toggle('is-active', document.queryCommandState('strikeThrough'));
      if (subBtn) subBtn.classList.toggle('is-active', document.queryCommandState('subscript'));
      if (supBtn) supBtn.classList.toggle('is-active', document.queryCommandState('superscript'));
      if (linkBtn) linkBtn.classList.toggle('is-active', Boolean(getSurroundingAnchor()));
    } catch {
      // queryCommandState might fail in certain test/jsdom environments
    }
  }

  editor.addEventListener('keyup', updateToolbarState);
  editor.addEventListener('mouseup', updateToolbarState);

  container.appendChild(toolbar);
  if (advancedToolbar) {
    container.appendChild(advancedToolbar);
  }
  container.appendChild(editor);

  return {
    element: container,
    validationControl: editor,
    getValue: () => sanitizeRichText(editor.innerHTML),
    setValue: (val) => {
      editor.innerHTML = sanitizeRichText(val || '');
      syncListBulletStyles(editor);
    }
  };
}

/**
 * Replaces an existing <textarea> or <input> element with a full rich text editor,
 * keeping the same id, placeholder, and initial value.
 * @param {HTMLElement} targetElement 
 * @param {Object} [options={}]
 * @returns {{ element: HTMLElement, validationControl: HTMLElement, getValue: () => string, setValue: (val: string) => void } | null}
 */
export function upgradeTextareaToRichText(targetElement, { fieldId, isSingleLine = false, ariaLabel = '', onChange = null } = {}) {
  if (!targetElement) return null;
  const controlId = targetElement.id;
  const placeholder = targetElement.placeholder || targetElement.getAttribute('placeholder') || '';
  const initialValue = targetElement.value || targetElement.innerHTML || '';
  const ariaDescribedBy = targetElement.getAttribute('aria-describedby') || '';
  const ariaLabelledBy = targetElement.getAttribute('aria-labelledby') || '';
  const resolvedAriaLabel = ariaLabel || targetElement.getAttribute('aria-label') || '';

  const rte = createRichTextEditor({
    controlId,
    fieldId: fieldId || controlId,
    value: initialValue,
    placeholder,
    isSingleLine,
    ariaDescribedBy,
    ariaLabelledBy,
    ariaLabel: resolvedAriaLabel,
    onChange
  });

  // Matched on `htmlFor` rather than a `label[for="…"]` selector, so an id needs no CSS escaping.
  const label = controlId ? [...document.querySelectorAll('label[for]')].find(candidate => /** @type {HTMLLabelElement} */ (candidate).htmlFor === controlId) : null;
  targetElement.replaceWith(rte.element);
  labelRichTextControl(rte.validationControl, /** @type {HTMLElement | null} */ (label));
  return rte;
}

