import React from 'react';

export const EmptyState: React.FC = () => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.8,
    padding: '40px 24px', textAlign: 'center', userSelect: 'none',
  }}>
    <div style={{ marginBottom: 20, opacity: 0.35 }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="4" width="28" height="32" rx="3" />
        <path d="M12 12h16M12 18h16M12 24h10" />
      </svg>
    </div>
    <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>// select a file to begin</div>
    <div style={{ opacity: 0.6, fontSize: 11 }}>Pick a file from the sidebar</div>
    <div style={{ opacity: 0.6, fontSize: 11 }}>to start reviewing annotations.</div>
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16, opacity: 0.5, fontSize: 10 }}>
      Tip: select any text in the plan to add a comment.
    </div>
  </div>
);
