import React from 'react';
import { Icon } from '../icons';

export default function OpendocsBanner() {
  return (
    <section className="ps od-ban-sec" id="opendocs">
      <div className="wrap">
        <div className="od-ban">
          <div>
            <div className="slabel">Also from openplan</div>
            <h2 className="stitle">Review the docs your agents write, too</h2>
            <p className="ssub">opendocs does for HTML documents what openplan does for plans: your team comments on the exact words, the agent revises, and every version is kept.</p>
          </div>
          <a href="https://opendocs.smithgajjar.dev" className="btnp">Meet opendocs <Icon name="arrow_right" size={14} /></a>
        </div>
      </div>
    </section>
  );
}
