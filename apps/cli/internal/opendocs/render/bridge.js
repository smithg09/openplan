/*
 * opendocs bridge — runs INSIDE the sandboxed (allow-scripts, opaque-origin)
 * iframe that hosts an agent-authored HTML document. It cannot reach the host
 * except through postMessage, which is the whole point: the document stays
 * isolated while the reviewer selects text and comments on it.
 *
 * Responsibilities:
 *   - turn a text selection into a quote-based CommentAnchor and report it up
 *   - locate ("re-anchor") a CommentAnchor in the current document and paint it
 *   - mark an anchor orphaned when its quote no longer matches
 *   - scroll to a painted anchor on request
 *
 * Protocol (frame -> host):
 *   {type:'opendocs:ready'}
 *   {type:'opendocs:selection', anchor, rect}      user selected text
 *   {type:'opendocs:selection-cleared'}
 *   {type:'opendocs:placements', placements:[{id, found, rect}]}
 *   {type:'opendocs:activate', id}                 reviewer clicked a highlight
 *   {type:'opendocs:layout', scrollTop, scrollHeight, viewHeight, anchors:{id:top}, headings:[{id,level,text,top}]}
 *   {type:'opendocs:scroll', scrollTop}
 *
 * Protocol (host -> frame):
 *   {type:'opendocs:paint', anchors:[{id, anchor, status, type}]}
 *   {type:'opendocs:theme', theme:'dark'|'light'}
 *   {type:'opendocs:scroll-to-heading', id}
 *   {type:'opendocs:scroll-by', dy}
 *   {type:'opendocs:print'}
 *   {type:'opendocs:scroll-to', id}
 *   {type:'opendocs:clear'}
 *
 * The anchoring is a compact port of the W3C TextQuoteSelector idea used by
 * slashdocs (quote + prefix/suffix context, with a character-offset hint for
 * disambiguation). MIT; see LICENSE.slashdocs alongside this file.
 */
(function () {
  "use strict";

  var CONTEXT = 32; // chars of prefix/suffix captured for disambiguation
  var HL_CLASS = "opendocs-hl";

  // ---- text index -----------------------------------------------------------
  // Build a flat string of the document's visible text plus a map from global
  // character offsets back to (textNode, nodeOffset), so a Range and an offset
  // span can be converted to each other.
  function buildIndex() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        while (p && p !== document.body) {
          var tag = p.nodeName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var text = "";
    var segments = []; // {node, start, end} in global offsets
    var node;
    while ((node = walker.nextNode())) {
      var start = text.length;
      text += node.nodeValue;
      segments.push({ node: node, start: start, end: text.length });
    }
    return { text: text, segments: segments };
  }

  // Map a global [start,end) range to a DOM Range using the index.
  function offsetsToRange(index, start, end) {
    var range = document.createRange();
    var set = { start: false, end: false };
    for (var i = 0; i < index.segments.length; i++) {
      var seg = index.segments[i];
      if (!set.start && start >= seg.start && start <= seg.end) {
        range.setStart(seg.node, start - seg.start);
        set.start = true;
      }
      if (!set.end && end >= seg.start && end <= seg.end) {
        range.setEnd(seg.node, end - seg.start);
        set.end = true;
      }
      if (set.start && set.end) break;
    }
    if (!set.start || !set.end) return null;
    return range;
  }

  // Map a DOM Range to a global [start,end) offset pair.
  function rangeToOffsets(index, range) {
    var start = -1,
      end = -1;
    for (var i = 0; i < index.segments.length; i++) {
      var seg = index.segments[i];
      if (seg.node === range.startContainer) start = seg.start + range.startOffset;
      if (seg.node === range.endContainer) end = seg.start + range.endOffset;
    }
    if (start < 0 || end < 0 || end < start) return null;
    return { start: start, end: end };
  }

  // ---- anchoring ------------------------------------------------------------
  function makeAnchor(index, off) {
    var quote = index.text.slice(off.start, off.end);
    var prefix = index.text.slice(Math.max(0, off.start - CONTEXT), off.start);
    var suffix = index.text.slice(off.end, Math.min(index.text.length, off.end + CONTEXT));
    return { quote: quote, prefix: prefix, suffix: suffix, start: off.start, end: off.end };
  }

  // Score how well a candidate occurrence of quote at `at` matches the stored
  // prefix/suffix context. Higher is better; context agreement breaks ties
  // between repeated quotes.
  function contextScore(text, at, anchor) {
    var score = 0;
    if (anchor.prefix) {
      var before = text.slice(Math.max(0, at - anchor.prefix.length), at);
      score += commonSuffixLen(before, anchor.prefix);
    }
    if (anchor.suffix) {
      var after = text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length);
      score += commonPrefixLen(after, anchor.suffix);
    }
    return score;
  }

  function commonPrefixLen(a, b) {
    var n = Math.min(a.length, b.length),
      i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }
  function commonSuffixLen(a, b) {
    var n = Math.min(a.length, b.length),
      i = 0;
    while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  }

  // Locate an anchor's quote in the current text. Returns {start,end} or null
  // (null => orphaned). Prefers the occurrence whose context best matches, with
  // the stored offset as a final tie-breaker.
  function locate(index, anchor) {
    var quote = anchor.quote;
    if (!quote) return null;
    var text = index.text;

    // Fast path: the stored offsets still hold the exact quote.
    if (
      typeof anchor.start === "number" &&
      text.slice(anchor.start, anchor.start + quote.length) === quote
    ) {
      return { start: anchor.start, end: anchor.start + quote.length };
    }

    var best = -1,
      bestScore = -1,
      from = 0,
      at;
    while ((at = text.indexOf(quote, from)) !== -1) {
      var score = contextScore(text, at, anchor);
      // Tie-break toward the occurrence nearest the original offset.
      if (typeof anchor.start === "number") {
        var dist = Math.abs(at - anchor.start);
        score = score * 100000 - dist;
      }
      if (score > bestScore) {
        bestScore = score;
        best = at;
      }
      from = at + 1;
    }
    if (best < 0) return null;
    return { start: best, end: best + quote.length };
  }

  // ---- highlight painting ---------------------------------------------------
  function clearHighlights() {
    var marks = document.querySelectorAll("." + HL_CLASS);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    }
  }

  // Wrap every text-node segment overlapping [start,end) in a highlight span.
  function paint(index, start, end, id, status, type) {
    var painted = false;
    for (var i = 0; i < index.segments.length; i++) {
      var seg = index.segments[i];
      if (seg.end <= start || seg.start >= end) continue;
      var from = Math.max(start, seg.start) - seg.start;
      var to = Math.min(end, seg.end) - seg.start;
      if (to <= from) continue;
      var node = seg.node;
      var mid = node.splitText(from);
      mid.splitText(to - from);
      var span = document.createElement("span");
      span.className = HL_CLASS;
      span.setAttribute("data-anchor-id", id);
      if (status) span.setAttribute("data-status", status);
      span.setAttribute("data-type", type || "comment");
      mid.parentNode.replaceChild(span, mid);
      span.appendChild(mid);
      span.addEventListener("click", function (ev) {
        ev.stopPropagation();
        send({ type: "opendocs:activate", id: this.getAttribute("data-anchor-id") });
      });
      painted = true;
    }
    return painted;
  }

  function firstRectFor(id) {
    var el = document.querySelector("." + HL_CLASS + '[data-anchor-id="' + cssEscape(id) + '"]');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // ---- host messaging -------------------------------------------------------
  function send(msg) {
    // Opaque origin: target "*" is safe because the frame holds no secrets and
    // only the host is listening on the other side.
    parent.postMessage(msg, "*");
  }

  function onPaint(anchors) {
    clearHighlights();
    var index = buildIndex();
    var placements = [];
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var loc = locate(index, a.anchor || a);
      if (!loc) {
        placements.push({ id: a.id, found: false });
        continue;
      }
      // Re-index after each paint since splitText mutates the tree.
      paint(index, loc.start, loc.end, a.id, a.status, a.type);
      index = buildIndex();
      placements.push({ id: a.id, found: true, rect: firstRectFor(a.id) });
    }
    send({ type: "opendocs:placements", placements: placements });
    reportLayout();
  }

  // ---- layout reporting (anchors + outline) ---------------------------------
  // The host lays its comment rail out against these document-space positions,
  // so cards stay level with the words they refer to as the page scrolls.
  function docTop(el) {
    return el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
  }

  function reportLayout() {
    var anchors = {};
    var marks = document.querySelectorAll("." + HL_CLASS);
    for (var i = 0; i < marks.length; i++) {
      var id = marks[i].getAttribute("data-anchor-id");
      if (!(id in anchors)) anchors[id] = Math.round(docTop(marks[i]));
    }
    var headings = [];
    var hs = document.querySelectorAll("h1,h2,h3");
    for (var j = 0; j < hs.length; j++) {
      var h = hs[j];
      var text = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      h.setAttribute("data-opendocs-h", String(j));
      headings.push({ id: String(j), level: Number(h.nodeName.charAt(1)), text: text.slice(0, 120), top: Math.round(docTop(h)) });
    }
    var de = document.documentElement;
    send({
      type: "opendocs:layout",
      scrollTop: window.pageYOffset || de.scrollTop || 0,
      scrollHeight: Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0),
      viewHeight: window.innerHeight,
      anchors: anchors,
      headings: headings,
    });
  }

  var layoutTimer = null;
  function queueLayout() {
    if (layoutTimer) return;
    layoutTimer = setTimeout(function () {
      layoutTimer = null;
      reportLayout();
    }, 80);
  }

  // ---- theme ----------------------------------------------------------------
  // The host tells us light or dark. We expose it the ways documents commonly
  // key off (data-theme, a class, color-scheme) so a document that supports
  // both follows the app; one that doesn't is left alone apart from color-scheme.
  function applyTheme(theme) {
    var de = document.documentElement;
    de.setAttribute("data-theme", theme);
    de.setAttribute("data-opendocs-theme", theme);
    de.classList.remove("dark", "light");
    de.classList.add(theme);
    de.style.colorScheme = theme;
  }

  function onSelection() {
    var sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      send({ type: "opendocs:selection-cleared" });
      return;
    }
    var range = sel.getRangeAt(0);
    if (!range.toString().trim()) {
      send({ type: "opendocs:selection-cleared" });
      return;
    }
    var index = buildIndex();
    var off = rangeToOffsets(index, range);
    if (!off) {
      send({ type: "opendocs:selection-cleared" });
      return;
    }
    var rect = range.getBoundingClientRect();
    send({
      type: "opendocs:selection",
      anchor: makeAnchor(index, off),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  }

  function scrollTo(id) {
    var el = document.querySelector("." + HL_CLASS + '[data-anchor-id="' + cssEscape(id) + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  window.addEventListener("message", function (ev) {
    var msg = ev.data;
    if (!msg || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "opendocs:paint":
        onPaint(msg.anchors || []);
        break;
      case "opendocs:scroll-to":
        scrollTo(msg.id);
        break;
      case "opendocs:clear":
        clearHighlights();
        break;
      case "opendocs:theme":
        applyTheme(msg.theme === "dark" ? "dark" : "light");
        queueLayout();
        break;
      case "opendocs:scroll-to-heading": {
        var hel = document.querySelector('[data-opendocs-h="' + cssEscape(msg.id) + '"]');
        if (hel && hel.scrollIntoView) hel.scrollIntoView({ block: "start", behavior: "smooth" });
        break;
      }
      case "opendocs:scroll-by":
        window.scrollBy({ top: Number(msg.dy) || 0 });
        break;
      case "opendocs:print":
        try { window.print(); } catch (e) { /* needs allow-modals */ }
        break;
    }
  });

  // Keep the host's floating comment UI glued to the selection while the
  // document scrolls: re-report the selection (same anchor, fresh rect).
  var scrollQueued = false;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function () {
        scrollQueued = false;
        send({ type: "opendocs:scroll", scrollTop: window.pageYOffset || document.documentElement.scrollTop || 0 });
        var sel = document.getSelection();
        if (sel && !sel.isCollapsed) onSelection();
      });
    },
    true
  );

  document.addEventListener("mouseup", function () {
    setTimeout(onSelection, 0);
  });
  document.addEventListener("keyup", function () {
    setTimeout(onSelection, 0);
  });

  // Announce readiness only once <body> exists — the bridge is injected at the
  // top of <head>, so buildIndex() would otherwise walk a null document.body.
  function ready() {
    send({ type: "opendocs:ready" });
    reportLayout();
    if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(document.body);
    window.addEventListener("load", queueLayout);
    window.addEventListener("resize", queueLayout);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
