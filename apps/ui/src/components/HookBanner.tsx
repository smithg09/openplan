import React from 'react';

interface HookBannerProps {
  timer: string;
}

export const HookBanner: React.FC<HookBannerProps> = ({ timer }) => (
  <div className="op-banner op-banner-hook">
    <span className="op-banner-bullet">●</span>
    <span className="op-banner-label">claude is waiting</span>
    <span className="op-banner-sep">·</span>
    <span className="op-banner-text">review this plan and approve or request changes</span>
    <span className="op-banner-spacer" />
    <span className="op-banner-meta">session open · {timer}</span>
  </div>
);
