import React from 'react';

const INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/smithg09/openplan/main/scripts/install.sh | bash';
const RELEASES_API = 'https://api.github.com/repos/smithg09/openplan/releases/latest';
const DISMISSED_KEY = 'openplan:update-dismissed';

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

interface UpdateBannerProps {
  currentVersion: string;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ currentVersion }) => {
  const [latestVersion, setLatestVersion] = React.useState<string | null>(null);
  const [releaseUrl, setReleaseUrl] = React.useState<string>('');
  const [dismissed, setDismissed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!currentVersion || currentVersion === 'dev') return;

    const dismissedFor = localStorage.getItem(DISMISSED_KEY);
    if (dismissedFor === currentVersion) {
      setDismissed(true);
      return;
    }

    fetch(RELEASES_API)
      .then(r => r.json())
      .then(data => {
        const tag: string = data.tag_name ?? '';
        if (tag && isNewer(tag, currentVersion)) {
          setLatestVersion(tag.replace(/^v/, ''));
          setReleaseUrl(data.html_url ?? '');
        }
      })
      .catch(() => {});
  }, [currentVersion]);

  if (dismissed || !latestVersion) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, currentVersion);
    setDismissed(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 1000,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      width: 300,
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 14,
        }}>
          ↑
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            Update available
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            v{latestVersion} is available (you have {currentVersion})
          </div>
        </div>
        <button
          onClick={handleDismiss}
          style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          title="Dismiss"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleCopy}
          style={{
            flex: 1,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'opacity 120ms',
          }}
        >
          {copied ? 'Copied!' : 'Copy install command'}
        </button>
        {releaseUrl && (
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Notes
          </a>
        )}
      </div>
    </div>
  );
};
