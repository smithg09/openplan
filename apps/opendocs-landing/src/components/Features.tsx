import React from 'react';

function Row({ label, title, children, visual, flip }: { label: string; title: string; children: React.ReactNode; visual: React.ReactNode; flip?: boolean }) {
  return (
    <div className={`fx-row${flip ? ' flip' : ''}`}>
      <div className="fx-copy">
        <div className="slabel">{label}</div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      <div className="fx-vis">{visual}</div>
    </div>
  );
}

export default function Features() {
  return (
    <section className="ps" id="features">
      <div className="wrap">
        <Row label="Local-first" title="Your documents stay where you wrote them"
          visual={<pre className="fx-pre"><span className="d">~/.opendocs/docs/acme-billing/</span>{'\n'}  checkout-latency-postmortem/{'\n'}    versions/<span className="d">7f3a9c…</span>.html{'\n'}    versions/<span className="d">c01e44…</span>.html{'\n'}    versions.json{'\n'}    comments.json</pre>}>
          Versions are plain files, content-addressed and immutable. Nothing is uploaded until you choose to share, and the review UI runs on your own machine.
        </Row>

        <Row flip label="Comments that stay put" title="Anchored to the words, not the pixels"
          visual={<div className="fx-quote"><span className="q">We will run migrations through the online-schema tool only</span><span className="fx-arrow">v2 → v3</span><span className="q gone">We will run schema changes through the online tool</span><span className="fx-note">Rewritten sentence: the comment is flagged as orphaned instead of pointing at the wrong place.</span></div>}>
          Each comment stores the quoted text and its surroundings. Edit around it and it re-attaches in the next version; rewrite the sentence and it tells you, rather than silently drifting.
        </Row>

        <Row label="Sharing" title="One link per person, one role per link"
          visual={<ul className="fx-roles"><li><b>Viewer</b><span>reads the doc and comments</span></li><li><b>Commenter</b><span>comments, replies, reacts, resolves</span></li><li><b>Editor</b><span>publishes versions, shares, deletes any comment</span></li></ul>}>
          No accounts to provision. The token lives in the URL fragment, so it never reaches a server log, and only its hash is stored. Revoke a link and it stops working.
        </Row>

        <Row flip label="Versions" title="Every revision kept, restorable in one click"
          visual={<ol className="fx-vers"><li><b>v4</b><span>Clarified abandonment base</span><i>latest</i></li><li><b>v3</b><span>Added CI dry-run gate</span></li><li><b>v2</b><span>Moved rota change to 1 December</span></li><li><b>v1</b><span>Initial version</span></li></ol>}>
          Open any version to see exactly what reviewers saw, or restore an old one as the new head. Comments stay attached to the version they were made on.
        </Row>

        <Row label="Everything else" title="Search it, export it, take it elsewhere"
          visual={<pre className="fx-pre"><em>$ </em>opendocs search "retry -draft"{'\n'}<span className="d">checkout-latency-postmortem</span> — …cap payment retries at two{'\n'}  attempts with jittered backoff.{'\n\n'}<em>$ </em>opendocs restore checkout-latency-postmortem v_c01e44</pre>}>
          Full-text search across your documents, comments exported as Markdown or JSON, the original HTML downloadable, and a print-to-PDF that follows your theme.
        </Row>
      </div>
    </section>
  );
}
