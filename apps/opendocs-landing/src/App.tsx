import React, { useState } from 'react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import TrustStrip from './components/TrustStrip';
import DemoSection from './components/DemoSection';
import FlowSection from './components/FlowSection';
import Features from './components/Features';
import SelfHost from './components/SelfHost';
import AppBanner from './components/AppBanner';
import Faq from './components/Faq';
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
      <DemoSection theme={theme} />
      <FlowSection />
      <Features />
      <SelfHost />
      <AppBanner />
      <Faq />
      <Footer />
    </PageAnnotator>
  );
}
