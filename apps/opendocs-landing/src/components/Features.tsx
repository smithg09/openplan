import React from 'react';
import TryIt from './TryIt';

function Block({ n, title, body, children, flip }: { n: string; title: string; body: React.ReactNode; children?: React.ReactNode; flip?: boolean }) {
  return (
    <div className={`fblock ${flip ? 'flip' : ''} ${children ? '' : 'solo'}`}>
      <div className="fcopy">
        <span className="fnum">{n}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      {children && <div className="fvis">{children}</div>}
    </div>
  );
}

export default function Features() {
  return (
    <section className="sec" id="features">
      <div className="wrap">
        <p className="eyebrow c">Real-time collaboration for the agentic era</p>
        <h2 className="h2">Everything between “the agent wrote it” and “the team signed off”.</h2>

        <Block n="01" title="Ship straight from the terminal" body={<>One command turns an agent’s HTML into a page your team can open. <code>opendocs publish</code> prints links you can send; run it again and it adds a new version to the <i>same</i> document.</>}>
          <div className="term big"><div className="term-bar"><i /><i /><i /><span>zsh</span></div>
            <pre><div><em>$</em> opendocs publish launch-plan.html --proxy https://docs.team</div>
              <div className="out">published 7f3a9c…<br />  commenter link   https://docs.team/d/7f3a9c…#t=•••<br />  viewer link      https://docs.team/d/7f3a9c…#t=•••<br />  editor link (keep private)  https://docs.team/d/7f3a9c…#t=•••</div>
              <div><em>$</em> opendocs publish launch-plan.html --summary "Moved date"</div>
              <div className="out">published new version v_4e1b of 7f3a9c…</div></pre></div>
        </Block>

        <div className="try-wrap">
          <Block n="02" title="Comment on the exact words" body={<>Select a phrase, a table cell or a caption and leave feedback right there. Comments are anchored to the quoted text, so they survive the next version — or flag themselves when the words are gone. <b>Try it below.</b></>}  />
          <TryIt />
        </div>

        <Block n="03" title="Share with exactly the right power" body={<>No accounts. Each link carries one role — viewer, commenter or editor — and can be revoked any time. Tokens live in the URL fragment, so they never hit a server log.</>}>
          <div className="roles">
            {[['viewer', 'Read the doc and the comments'], ['commenter', 'Comment, reply, react, resolve'], ['editor', 'Publish versions, share, delete any comment']].map(([r, d]) => (
              <div className="role" key={r}><span className="pill">{r}</span><span>{d}</span><i>copy link</i></div>
            ))}
          </div>
        </Block>

        <Block n="04" title="A built-in loop for your agent" body={<>The agent reads your comments straight from the page as structured JSON, revises the document, and publishes the next version. <code>opendocs review</code> even <i>waits</i> for you to hit Submit — no polling, no pasting feedback into a prompt.</>} flip>
          <div className="term big"><div className="term-bar"><i /><i /><i /><span>agent</span></div>
            <pre><div><em>$</em> opendocs feedback launch-plan.html</div>
              <div className="out json">{`{ "open": [ {\n    "author": "Priya",\n    "quote": "September 12",\n    "comment": "Can we confirm legal sign-off first?"\n  } ], "resolved": 3 }`}</div></pre></div>
        </Block>

        <Block n="05" title="Every version, never “final_v2_FINAL”" body={<>Versions are immutable, content-addressed snapshots with a parent chain. Compare, switch between them, or restore an old one as the new head — comments stay attached to the version they were made on.</>}>
          <div className="versions">
            {[['v4', 'Moved date, added sign-off gate', 'latest'], ['v3', 'Rewrote risks section', ''], ['v2', 'Added rollout flag', ''], ['v1', 'First draft', '']].map(([v, s, t], i) => (
              <div className={`vrow ${t ? 'cur' : ''}`} key={v}><b>{v}</b><span>{s}</span>{t && <em>{t}</em>}<u style={{ opacity: 1 - i * 0.18 }} /></div>
            ))}
          </div>
        </Block>
      </div>
    </section>
  );
}
