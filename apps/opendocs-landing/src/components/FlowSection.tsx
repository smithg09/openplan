import React from 'react';

interface Step { n: string; title: string; body: string; lines: { c?: 'p' | 'o' | 'a' | 'd' | 'r'; t: string }[] }

const STEPS: Step[] = [
  { n: '01', title: 'Your agent publishes it', body: 'You ask for the document. The agent writes one self-contained HTML file and publishes it. Locally that opens the review UI; on a proxy it prints links.',
    lines: [
      { c: 'p', t: 'Ife: Write up last night’s checkout latency incident as a postmortem.' },
      { c: 'a', t: 'claude  → writing checkout-latency-postmortem.html' },
      { c: 'p', t: 'opendocs publish checkout-latency-postmortem.html --proxy https://docs.northwind.dev' },
      { c: 'o', t: 'published 9c41e0…' },
      { c: 'o', t: '  commenter  https://docs.northwind.dev/d/9c41e0…#t=•••' },
      { c: 'o', t: '  editor     (keep private)' },
    ] },
  { n: '02', title: 'Your team comments on the words', body: 'Wanjiru, Tomasz and anyone with the link highlight exact sentences. No accounts: each link carries a role, and you can revoke it.',
    lines: [
      { c: 'p', t: 'opendocs feedback checkout-latency-postmortem.html' },
      { c: 'o', t: '{ "open": [' },
      { c: 'o', t: '  { "author": "Wanjiru Kamau", "type": "question",' },
      { c: 'o', t: '    "quote": "6.2% of sessions abandoned the cart",' },
      { c: 'o', t: '    "comment": "All sessions, or only those that reached payment?" },' },
      { c: 'o', t: '  { "author": "Tomasz Brandt", "type": "suggestion", ... } ], "resolved": 0 }' },
    ] },
  { n: '03', title: 'The agent revises the same doc', body: 'It reads the threads as JSON, edits the file in place, and publishes the next version. Same link; every earlier version is kept.',
    lines: [
      { c: 'd', t: '- 6.2% of sessions abandoned the cart, against a usual 1.8%.' },
      { c: 'r', t: '+ 6.2% of sessions that reached payment abandoned the cart (usual: 1.8%).' },
      { c: 'p', t: 'opendocs publish checkout-latency-postmortem.html --summary "Clarified abandonment base"' },
      { c: 'o', t: 'published new version v_4e1b of 9c41e0…' },
    ] },
];

export default function FlowSection() {
  const [i, setI] = React.useState(0);
  const [auto, setAuto] = React.useState(true);
  React.useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % STEPS.length), 6500);
    return () => window.clearInterval(id);
  }, [auto]);
  const step = STEPS[i];

  return (
    <section className="ps fl-sec" id="flow">
      <div className="wrap">
        <div className="slabel">How it works</div>
        <h2 className="stitle">From a prompt to a revised document</h2>
        <div className="fl-grid">
          <ol className="fl-steps">
            {STEPS.map((s, k) => (
              <li key={s.n} className={k === i ? 'on' : ''}>
                <button onClick={() => { setAuto(false); setI(k); }}>
                  <span className="fl-n">{s.n}</span>
                  <span className="fl-t">{s.title}</span>
                </button>
                {k === i && <p>{s.body}</p>}
              </li>
            ))}
          </ol>
          <div className="fl-term" aria-live="polite">
            <div className="fl-bar"><span>agent · zsh</span><span className="fl-bar-r">step {step.n} of 03</span></div>
            <pre key={step.n}>
              {step.lines.map((l, k) => (
                <div key={k} className={`fl-line ${l.c ?? ''}`} style={{ animationDelay: `${k * 90}ms` }}>
                  {l.c === 'p' && !l.t.startsWith('Ife') && <em>$ </em>}{l.t}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
