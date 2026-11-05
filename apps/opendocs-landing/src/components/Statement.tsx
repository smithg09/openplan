import React from 'react';
import { useInView } from '../hooks';

function useCount(to: number, start: boolean, ms = 1100): number {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, start, ms]);
  return v;
}

function Fact({ n, suffix = '', label, start }: { n: number; suffix?: string; label: string; start: boolean }) {
  const v = useCount(n, start);
  return (
    <div className="fact"><div className="fact-n">{v}{suffix}</div><div className="fact-l">{label}</div></div>
  );
}

export default function Statement() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <section className="statement">
      <div className="wrap">
        <p className="big">
          Agents aren’t just writing text anymore. They’re shipping <em>interactive HTML</em> — live tables,
          charts, mock-ups and dashboards. <span>opendocs is where your team reviews all of it, and where the agent reads the feedback and revises.</span>
        </p>
        <div className="badges">
          <span>Agent-agnostic</span><span>Local-first</span><span>Self-hostable</span><span>MIT licensed</span>
        </div>
        <div className="facts" ref={ref}>
          <Fact n={0} label="accounts to create" start={seen} />
          <Fact n={1} label="binary to run" start={seen} />
          <Fact n={3} suffix="" label="agents with ready-made skills" start={seen} />
          <Fact n={100} suffix="%" label="of versions kept" start={seen} />
        </div>
      </div>
    </section>
  );
}
