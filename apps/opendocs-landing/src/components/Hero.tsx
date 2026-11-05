import React from 'react';
import { prefersReducedMotion, useTyped } from '../hooks';

const PUBLISH = 'opendocs publish launch-plan.html';
const COMMENT = 'Can we confirm legal sign-off before this date?';
const FEEDBACK = 'opendocs feedback launch-plan.html';

// Timeline (ms) of one loop of the hero animation.
const STAGES = [
  { at: 0, name: 'idle' },
  { at: 600, name: 'publishing' },
  { at: 3200, name: 'published' },
  { at: 4400, name: 'selected' },
  { at: 5400, name: 'composing' },
  { at: 9000, name: 'commented' },
  { at: 10400, name: 'feedback' },
  { at: 13200, name: 'revised' },
  { at: 17500, name: 'end' },
] as const;
type Stage = (typeof STAGES)[number]['name'];
const idx = (s: Stage) => STAGES.findIndex((x) => x.name === s);

function useLoop(): Stage {
  const [stage, setStage] = React.useState<Stage>(prefersReducedMotion() ? 'revised' : 'idle');
  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    let timers: number[] = [];
    const run = () => {
      timers = STAGES.map((s) => window.setTimeout(() => setStage(s.name), s.at));
      timers.push(window.setTimeout(run, STAGES[STAGES.length - 1].at + 400));
    };
    run();
    return () => timers.forEach(window.clearTimeout);
  }, []);
  return stage;
}

export default function Hero() {
  const stage = useLoop();
  const at = (s: Stage) => idx(stage) >= idx(s);
  const typedPublish = useTyped(PUBLISH, stage === 'publishing', 45);
  const publishText = at('published') ? PUBLISH : typedPublish;
  const typedComment = useTyped(COMMENT, stage === 'composing', 42);
  const commentText = at('commented') ? COMMENT : typedComment;
  const typedFeedback = useTyped(FEEDBACK, stage === 'feedback', 35);
  const feedbackText = at('revised') ? FEEDBACK : typedFeedback;

  const step = at('feedback') ? 2 : at('selected') ? 1 : 0;
  const revised = at('revised');

  return (
    <header className="hero">
      <div className="tunnel" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Agentic collaboration, for HTML</p>
          <h1>The workspace for <span className="grad">agentic teams.</span></h1>
          <p className="lede">
            opendocs is where teams host, review and revise the interactive HTML their agents ship —
            plans, specs, reports and dashboards. Comment on the exact words. Every version kept.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href="#install">Get started</a>
            <a className="btn btn-ghost" href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.96 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.08-1.87 3.76-3.66 3.96.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
              GitHub
            </a>
          </div>
          <ol className="steps-words" aria-label="build, review, revise">
            {['build', 'review', 'revise'].map((w, i) => (
              <li key={w} className={i === step ? 'on' : i < step ? 'done' : ''}>{w}</li>
            ))}
          </ol>
        </div>

        <div className="stage" aria-hidden="true">
          <div className="win">
            <div className="win-bar">
              <i /><i /><i />
              <span className="win-title"><b>$ /</b> opendocs / launch-plan.html</span>
              <span className={`ver ${revised ? 'v2' : ''}`}>{revised ? 'version 2' : at('published') ? 'version 1' : '—'}</span>
            </div>
            <div className="win-body">
              <div className={`doc ${at('published') ? 'show' : ''}`}>
                <h4>Q3 launch plan</h4>
                <p>
                  We ship the beta on{' '}
                  <span className={`hl ${at('selected') ? 'sel' : ''} ${at('commented') ? 'done' : ''}`}>
                    {revised ? 'September 26, after legal sign-off' : 'September 12'}
                  </span>{' '}
                  to 500 design-partner accounts, behind a staged rollout flag.
                </p>
                <p>Support coverage is business hours only until the on-call rota is staffed.</p>
                <div className="skel"><i /><i /><i /></div>

                {stage === 'selected' && <div className="fbtn">💬 Comment</div>}
                {stage === 'composing' && (
                  <div className="pop">
                    <div className="q">September 12</div>
                    <div className="ta">{commentText}<u /></div>
                    <div className="pop-actions"><span>⌘↵ to post</span><b>Comment</b></div>
                  </div>
                )}
              </div>
              <div className="rail">
                <div className="rail-h">Comments <span>{at('commented') ? '1 open' : '0 open'}</span></div>
                {at('commented') && (
                  <div className="card">
                    <div className="who"><b>Priya</b><span>just now</span></div>
                    <div className="quote">{revised ? 'September 26, after legal sign-off' : 'September 12'}</div>
                    <p>{COMMENT}</p>
                    {revised && <p className="reply"><b>Agent</b> Moved to Sept 26 and added a sign-off gate in v2.</p>}
                  </div>
                )}
                {!at('commented') && <div className="rail-empty">Select text to comment</div>}
              </div>
            </div>
          </div>

          <div className="term">
            <div className="term-bar"><i /><i /><i /><span>agent — zsh</span></div>
            <pre>
              {at('publishing') && <div><em>$</em> {publishText}{(stage === 'publishing') && <u />}</div>}
              {at('published') && <div className="out">✓ published · version 1<br />  commenter link  https://docs.team/d/…</div>}
              {at('feedback') && <div><em>$</em> {feedbackText}{stage === 'feedback' && <u />}</div>}
              {at('revised') && <div className="out">1 open thread → editing → published v2 ✓</div>}
            </pre>
          </div>
        </div>
      </div>
    </header>
  );
}
