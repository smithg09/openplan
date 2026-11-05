import React from 'react';

/** Reveals `text` one character at a time while `active`; resets when inactive. */
export function useTyped(text: string, active: boolean, msPerChar = 38): string {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!active) { setN(0); return; }
    setN(0);
    const id = window.setInterval(() => setN((v) => { if (v >= text.length) { window.clearInterval(id); return v; } return v + 1; }), msPerChar);
    return () => window.clearInterval(id);
  }, [text, active, msPerChar]);
  return text.slice(0, n);
}

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
