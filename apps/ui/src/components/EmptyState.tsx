import React from 'react';
import { Icon } from '@openplan/annotations';

export const EmptyState: React.FC = () => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.8,
    padding: '40px 24px', textAlign: 'center', userSelect: 'none',
  }}>
    <div style={{ marginBottom: 20, opacity: 0.35 }}>
      <Icon name="description" size={40} />
    </div>
    <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>// select a file to begin</div>
    <div style={{ opacity: 0.6, fontSize: 11 }}>Pick a file from the sidebar</div>
    <div style={{ opacity: 0.6, fontSize: 11 }}>to start reviewing annotations.</div>
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16, opacity: 0.5, fontSize: 10 }}>
      Tip: select any text in the plan to add a comment.
    </div>
  </div>
);
