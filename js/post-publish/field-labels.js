// Programmatic labels for the Post-Publish editors.
//
// The Glossary, Resources, Help & Support and Style editors lay each field out as
// `<div class="input-wrapper"><label>Support Email Address</label><input …></div>`: the label sits
// beside its control but is not associated with it (no `for`/`id`, not wrapping it). A screen reader
// announced those inputs by their placeholder at best ("support@company.com"), and a select by
// nothing. This links each label to the control that follows it, and marks required fields.
//
// The editors redraw their lists on add, delete and search, so `keepFieldsLabelled` re-runs the
// association whenever the structure changes.

let counter = 0;

/** @param {Element} control */
function hasName(control) {
  return Boolean(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || control.closest('label'));
}

/**
 * Associates every unassociated `<label>` under `root` with the first form control after it in the same
 * wrapper. Labels that already have `for`, that wrap their control, or whose control already has an
 * accessible name are left alone. Rich-text editors are named separately (an explicit `ariaLabel`).
 * @param {ParentNode} root
 */
export function associateFieldLabels(root) {
  root.querySelectorAll('label').forEach(label => {
    // The visual "*" is not part of the name; the requirement is exposed with aria-required instead.
    const required = label.querySelector('.required');
    required?.setAttribute('aria-hidden', 'true');

    if (label.htmlFor || label.querySelector('input, select, textarea')) return;
    const wrapper = label.parentElement;
    if (!wrapper) return;
    const control = [...wrapper.querySelectorAll('input, select, textarea')].find(candidate =>
      /** @type {HTMLInputElement} */ (candidate).type !== 'hidden'
      && !candidate.closest('.rich-text-editor-container')
      && (label.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (!control || hasName(control)) return;
    if (!control.id) {
      counter += 1;
      control.id = `ppt-field-${counter}`;
    }
    label.htmlFor = control.id;
    if (required) control.setAttribute('aria-required', 'true');
  });
}

/**
 * Labels `container` now and again after every structural change inside it. Edits inside a
 * contenteditable (typing in a rich-text field) are ignored so large lists are not rescanned per keystroke.
 * @param {HTMLElement} container
 * @returns {() => void} stop watching
 */
export function keepFieldsLabelled(container) {
  associateFieldLabels(container);
  const observer = new MutationObserver(records => {
    const structural = records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return !target?.closest('[contenteditable="true"]');
    });
    if (structural) associateFieldLabels(container);
  });
  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}
