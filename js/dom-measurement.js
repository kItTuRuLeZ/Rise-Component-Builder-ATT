// Renders a compiled export's HTML into hidden, offscreen iframes to measure real layout
// dimensions (P07) — the one thing this project's otherwise-pure preflight rules can't
// determine from config data alone. Feeds js/validation.js's clipping-risk and
// mobile-overflow heuristics; see docs/VALIDATION-RULES.md "Rules requiring manual
// judgment" for what this can't guarantee.
//
// Deliberately does NOT use `allow-same-origin` on the measurement iframes, matching this
// project's existing convention for every iframe that renders compiled component output
// (the live-preview iframe, index.html; the exported Iframe Snippet, js/export.js) — see
// docs/SECURITY.md. `allow-scripts` + `allow-same-origin` together would let the iframe's
// content script access the parent page (localStorage, IndexedDB media) if sanitization
// were ever imperfect; this module never needs that, since it reads dimensions via
// postMessage from inside the iframe instead of reaching in via `contentDocument` —
// the same cross-sandbox channel js/completion.js already uses for completion reporting.
//
// Measured in two phases per viewport width, not one iframe walking every state in turn:
//  Phase 1 — one iframe measures the initial (default, all-collapsed) state and, while it's
//    there, counts how many accordion/tab triggers exist (`[aria-expanded="false"]` /
//    `[role="tab"][aria-selected="false"]`).
//  Phase 2 — one hidden iframe PER trigger, all created and measured simultaneously, each
//    independently loading the same compiled HTML and clicking only its own assigned
//    trigger before settling.
// Most content (and its media) is hidden until its own item is opened, so a single
// "collapsed" reading misses it — the previous design covered this by clicking through every
// trigger in turn inside one shared iframe, but that made the wall-clock cost grow with the
// number of items (each state needing up to ASSET_WAIT_MS + MAX_POLLS*POLL_MS before the next
// could even start), so a several-item accordion with media could approach or exceed the
// overall timeout and get reported as "could not be measured" even though every individual
// state was, on its own, perfectly measurable. Measuring every triggered state in parallel
// instead bounds the total cost to the SLOWEST single state, not their sum — independent of
// how many items the component has.

const MEASUREMENT_MESSAGE_TYPE = 'rcb-dom-measurement';

// Same cap the old single-iframe design used for how many triggers it would walk through;
// kept here (not just inside the injected script) since the host now needs it too, to bound
// how many phase-2 iframes it spawns.
const MAX_TRIGGERS = 16;

// Hard per-iframe ceiling: covers one state's own asset-wait + settle-poll budget (below)
// plus iframe creation/message-passing overhead. Phase 1 and phase 2 each spend up to this
// long, so the whole two-phase measurement for one width is bounded by roughly 2x this value
// — see measureRenderedDimensions' own timeoutMs default, sized to comfortably cover that.
const PER_STATE_TIMEOUT_MS = 7000;

// Runs INSIDE the sandboxed hidden iframe. Deterministic by construction:
//  1. waits for `load`, web fonts and every image (a reading taken before those settle is
//     what made repeated checks disagree, including the occasional 0px height);
//  2. polls until two consecutive readings are identical (or gives up and reports
//     `settled: false`, which the host treats as "unmeasured", never as a pass or a warning);
//  3. with a numeric target trigger index, clicks only that one trigger and repeats 1-2 for
//     the resulting state (correct for a component where opening one item closes the others,
//     e.g. a single-open accordion — there, "only this one open" is the only state that can
//     ever really occur); with target `'all'`, clicks every trigger in rapid succession with
//     no waiting in between, then does ONE settle pass over the result (correct for a
//     component where more than one item can be open at once, e.g. Accordion's "allow
//     multiple open items" setting — there, the true worst case needs every item open
//     together, which per-trigger-alone states alone would under-measure; batching the clicks
//     and settling once reaches that cumulative state without paying for N sequential waits);
//     without a target, just counts the triggers present at the default state (the host uses
//     this count to decide how many phase-2 iframes to spawn).
function buildMeasurementScript(targetIndex) {
  const mode = targetIndex === 'all' ? 'all' : typeof targetIndex === 'number' ? 'one' : 'discover';
  return `<script>(function() {
  var STABLE_READINGS = 2, POLL_MS = 50, MAX_POLLS = 40, ASSET_WAIT_MS = 2500, DEADLINE_MS = ${PER_STATE_TIMEOUT_MS - 1500};
  var reported = false;
  function reading() {
    var d = document.documentElement;
    return { h: d.scrollHeight, sw: d.scrollWidth, cw: d.clientWidth };
  }
  function settle() {
    return new Promise(function(resolve) {
      var last = null, stable = 0, polls = 0;
      (function tick() {
        var r = reading();
        stable = last && r.h === last.h && r.sw === last.sw && r.cw === last.cw ? stable + 1 : 0;
        last = r; polls++;
        if (stable >= STABLE_READINGS) return resolve({ r: r, settled: true });
        if (polls >= MAX_POLLS) return resolve({ r: r, settled: false });
        setTimeout(tick, POLL_MS);
      })();
    });
  }
  function assetsReady() {
    var waits = [];
    // Capped like images: a promise that never resolves in some engines must not hang the run.
    if (document.fonts && document.fonts.ready) waits.push(Promise.race([document.fonts.ready, new Promise(function(done) { setTimeout(done, ASSET_WAIT_MS); })]));
    Array.prototype.forEach.call(document.images, function(img) {
      // loading="lazy" images in an offscreen 1px frame never load; force them eager.
      if (img.loading === 'lazy') img.loading = 'eager';
      // Capped: a blocked or slow asset must never hang the measurement.
      if (!img.complete) waits.push(new Promise(function(done) { img.addEventListener('load', done); img.addEventListener('error', done); setTimeout(done, ASSET_WAIT_MS); }));
    });
    return Promise.all(waits);
  }
  function widest(cw) {
    var worst = null, max = cw;
    Array.prototype.forEach.call(document.body.querySelectorAll('*'), function(el) {
      var box = el.getBoundingClientRect();
      if (!box.width && !box.height) return;
      if (getComputedStyle(el).position === 'fixed') return;
      if (box.right > max + 0.5) { max = box.right; worst = el; }
    });
    if (!worst) return null;
    var cls = typeof worst.className === 'string' ? worst.className.split(/\\s+/)[0] : '';
    return { tag: worst.tagName.toLowerCase(), cls: cls, overflowPx: Math.round(max - cw) };
  }
  function triggers() {
    return document.querySelectorAll('[aria-expanded="false"], [role="tab"][aria-selected="false"]');
  }
  function run() {
    return assetsReady().then(settle).then(function(first) {
      var triggerCount = triggers().length;
      ${mode === 'discover' ? `
      return { r: first.r, settled: first.settled, offender: widest(first.r.cw), triggerCount: triggerCount };` : ''}
      ${mode === 'one' ? `
      var target = triggers()[${targetIndex}];
      if (!target) return { r: first.r, settled: first.settled, offender: widest(first.r.cw), triggerCount: triggerCount };
      try { target.click(); } catch (e) {}
      return assetsReady().then(settle).then(function(next) {
        return { r: next.r, settled: next.settled, offender: widest(next.r.cw), triggerCount: triggerCount };
      });` : ''}
      ${mode === 'all' ? `
      Array.prototype.forEach.call(triggers(), function(t) { try { t.click(); } catch (e) {} });
      return assetsReady().then(settle).then(function(next) {
        return { r: next.r, settled: next.settled, offender: widest(next.r.cw), triggerCount: triggerCount };
      });` : ''}
    });
  }
  function send(payload) {
    if (reported) return;
    reported = true;
    try { window.parent.postMessage({ type: ${JSON.stringify(MEASUREMENT_MESSAGE_TYPE)}, payload: payload }, '*'); } catch (e) {}
  }
  function start() {
    // Whatever happens, report before the host gives up: a best-effort reading so far,
    // flagged unsettled (the host treats that as "unmeasured", never as a pass or a warning).
    setTimeout(function() { send({ r: reading(), settled: false, offender: null, triggerCount: 0 }); }, DEADLINE_MS);
    run().then(send, function() { send(null); });
  }
  // Not \`load\`: a loading="lazy" image in an offscreen frame can keep it from ever firing in
  // some engines, and assets are waited for explicitly (with caps) above.
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();</script>`;
}

function injectMeasurementScript(html, targetIndex) {
  const script = buildMeasurementScript(targetIndex);
  // No scrollbar: a 1px-tall frame would otherwise show one and shave ~15px off the width
  // the component is laid out at, which real phones (overlay scrollbars) don't do.
  // Also no transitions/animations: Chromium doesn't advance them in an offscreen, invisible
  // frame, so an opened accordion panel (a max-height transition) would stay collapsed and be
  // under-measured there while Firefox and WebKit measured it open.
  const style = '<style>html{overflow:hidden !important}*,*::before,*::after{transition:none !important;animation:none !important}</style>';
  const withStyle = html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : `${style}${html}`;
  return withStyle.includes('</body>') ? withStyle.replace('</body>', `${script}</body>`) : `${withStyle}${script}`;
}

function createHiddenIframe(widthPx) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.sandbox = 'allow-scripts';
  // The iframe's own box height must stay minimal, not a "reasonable-looking" fixed
  // value: the compiled export's base CSS sets `body { min-height: 100vh }`
  // (js/export-shell.js), and `100vh` inside an iframe resolves against *this* iframe's
  // own height — a larger value here would inflate documentElement.scrollHeight to at
  // least that height regardless of the component's actual content height, defeating the
  // measurement entirely. 1px keeps 100vh negligible so real content always dominates.
  iframe.style.cssText = `position:absolute; top:-9999px; left:-9999px; width:${widthPx}px; height:1px; border:0; visibility:hidden;`;
  document.body.appendChild(iframe);
  return iframe;
}

/**
 * Measures exactly one state (the default state, or one trigger clicked) in its own
 * disposable hidden iframe. Resolves `null` on any failure (timeout, abort) rather than
 * throwing — a broken measurement must never crash Preflight or block export.
 */
function measureOneState(html, widthPx, targetIndex, timeoutMs, signal) {
  return new Promise(resolve => {
    const iframe = createHiddenIframe(widthPx);
    let settled = false;

    const finish = result => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      iframe.remove();
      resolve(result);
    };
    const onMessage = event => {
      if (event.source !== iframe.contentWindow || event.data?.type !== MEASUREMENT_MESSAGE_TYPE) return;
      finish(event.data.payload);
    };
    const onAbort = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
    iframe.srcdoc = injectMeasurementScript(html, targetIndex);
  });
}

/** Worst case across every measured state (the default state plus one per trigger). A state
    that resolved to `null` entirely (iframe-level timeout/abort, not just "didn't settle in
    time") makes the whole combined result untrusted, same as any one state failing to settle
    — there's no way to know if the missing state would have been the tallest/widest one. */
function mergeStates(states) {
  const valid = states.filter(Boolean);
  if (!valid.length) return null;
  let offender = null;
  for (const s of valid) {
    if (s.offender && (!offender || s.offender.overflowPx > offender.overflowPx)) offender = s.offender;
  }
  return {
    scrollHeight: Math.max(...valid.map(s => s.r.h)),
    overflowPx: Math.max(0, ...valid.map(s => s.r.sw - s.r.cw)),
    statesMeasured: states.length,
    settled: states.length === valid.length && valid.every(s => s.settled),
    offender
  };
}

/** Phase 1 (default state + trigger count) then phase 2: every trigger's own alone-state
    (needed for a single-open component, and for per-item overflow/offender detection
    regardless of open mode) plus one cumulative all-triggers-open state (needed for a
    multi-open-capable component's true worst-case height) — all measured in parallel. See
    the file-level comment for why this replaced one iframe walking every state in turn. */
async function measureAtWidth(html, widthPx, timeoutMs, signal) {
  const perStateTimeout = Math.min(timeoutMs, PER_STATE_TIMEOUT_MS);
  const first = await measureOneState(html, widthPx, undefined, perStateTimeout, signal);
  if (!first) return null;
  const triggerCount = Math.min(first.triggerCount || 0, MAX_TRIGGERS);
  if (!triggerCount) return mergeStates([first]);
  const [alone, all] = await Promise.all([
    Promise.all(Array.from({ length: triggerCount }, (_, i) => measureOneState(html, widthPx, i, perStateTimeout, signal))),
    measureOneState(html, widthPx, 'all', perStateTimeout, signal)
  ]);
  return mergeStates([first, ...alone, all]);
}

/**
 * Best-effort: any failure (timeout, aborted, no DOM environment) resolves to `null` for
 * that dimension rather than throwing or hanging — a broken measurement must never crash
 * Preflight or block export. A reading that never stabilised is also reported as `null`
 * (unmeasured) rather than guessed at, so a flaky reading can neither raise a false
 * warning nor hide a real one. Runs the desktop and mobile measurements in parallel (two
 * independent two-phase processes, not one resized+reflowed iframe, for simplicity/
 * reliability over a ResizeObserver-based single-iframe approach).
 *
 * Collapsed accordions/disclosures/tabs are each measured in their own parallel iframe and
 * the worst case is reported, so content (and media) that is hidden by default is included.
 *
 * @param {string} html - the fully compiled export HTML (js/preview.js#generateIframeContent)
 * @param {{ desktopWidth?: number, mobileWidth?: number, timeoutMs?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ desktopContentHeight: number|null, mobileOverflowPx: number|null, mobileOffender: {tag: string, cls: string, overflowPx: number}|null, statesMeasured: number } | null>}
 *   `null` overall only when there was nothing to measure (no html, no DOM). Otherwise each
 *   field is independently `null` only if that specific measurement failed/timed out.
 */
export async function measureRenderedDimensions(html, options = {}) {
  // Default covers phase 1 + phase 2 of the slower of the two widths (each phase capped at
  // PER_STATE_TIMEOUT_MS) with headroom for iframe creation/message-passing overhead.
  const { desktopWidth = 740, mobileWidth = 375, timeoutMs = 15000, signal } = options;
  if (typeof document === 'undefined' || !html) return null;
  // jsdom has no layout engine and never runs iframe scripts; waiting out the timeout would
  // only stall tests. Nothing was measured, which callers already treat as "unmeasured".
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return null;
  if (signal?.aborted) return null;

  const [desktop, mobile] = await Promise.all([
    measureAtWidth(html, desktopWidth, timeoutMs, signal),
    measureAtWidth(html, mobileWidth, timeoutMs, signal)
  ]);

  return {
    desktopContentHeight: desktop && desktop.settled ? desktop.scrollHeight : null,
    mobileOverflowPx: mobile && mobile.settled ? mobile.overflowPx : null,
    mobileOffender: mobile && mobile.settled ? mobile.offender : null,
    statesMeasured: Math.max(desktop?.statesMeasured || 0, mobile?.statesMeasured || 0)
  };
}
