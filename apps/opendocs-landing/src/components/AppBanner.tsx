import React from 'react';
import Reveal from './Reveal';
import { Icon } from '../icons';

export default function AppBanner() {
  return (
    <section className="ps ab-sec" id="app">
      <div className="wrap">
        <Reveal>
          <div className="ab">
            <div>
              <div className="slabel">The app</div>
              <h2 className="stitle">Open opendocs in your browser</h2>
              <p className="ssub">Read the sample document, load a folder of HTML files from your machine, or open a link someone shared. Nothing leaves your browser until you publish.</p>
            </div>
            <a href="/app/" className="btnp">Open the app <Icon name="arrow_right" size={14} /></a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
