import React from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Ticker from './components/Ticker';
import Statement from './components/Statement';
import Features from './components/Features';
import Install from './components/Install';
import Faq from './components/Faq';
import Footer from './components/Footer';

export default function App() {
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  };
  return (
    <>
      <Nav theme={theme} onToggle={toggle} />
      <Hero />
      <Ticker />
      <Statement />
      <section className="sec how" id="how">
        <div className="wrap">
          <p className="eyebrow c">How it works</p>
          <div className="how-grid">
            {[['Build', 'Your agent writes a self-contained HTML document — a plan, spec, report or dashboard — and publishes it.'],
              ['Review', 'Your team opens the link, highlights the exact words, and comments. Roles keep it safe: viewer, commenter, editor.'],
              ['Revise', 'The agent reads the threads as JSON, edits the same file, and publishes the next version. Repeat until done.']].map(([t, d], i) => (
              <div className="how-card" key={t}><span>{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>
      <Features />
      <Install />
      <Faq />
      <Footer />
    </>
  );
}
