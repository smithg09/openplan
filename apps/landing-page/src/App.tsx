import React, { useState } from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import TrustStrip from './components/TrustStrip';
import DemoSection from './components/DemoSection';
import GifSection from './components/GifSection';
import FeaturesSection from './components/FeaturesSection';
import Footer from './components/Footer';
import PageAnnotator from './components/PageAnnotator';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  };

  return (
    <PageAnnotator theme={theme}>
      <Nav theme={theme} onToggle={toggle} />
      <Hero />
      <TrustStrip />
      <DemoSection />
      <GifSection />
      <FeaturesSection />
      <Footer />
    </PageAnnotator>
  );
}
