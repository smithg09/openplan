import React from 'react';
import { Button, Bracket, Toggle } from './Primitives';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsSave: React.FC = () => {
  const [auto, setAuto] = React.useState(true);
  const [repo, setRepo] = React.useState(false);
  return (
    <>
      <div className="op-settings-section">
        <h3>// save behavior</h3>
        <div className="op-settings-row">
          <div className="op-settings-label">
            Auto-save on approve
            <div className="op-settings-sub">Write to all enabled destinations when a plan is approved</div>
          </div>
          <div className="op-settings-control"><Toggle on={auto} onChange={setAuto} /></div>
        </div>
        <div className="op-settings-row">
          <div className="op-settings-label">
            Default destination
            <div className="op-settings-sub">Where Save dropdown points by default</div>
          </div>
          <div className="op-settings-control"><Bracket hasChevron>local</Bracket></div>
        </div>
      </div>
      <div className="op-settings-section">
        <h3>// local</h3>
        <div className="op-settings-row">
          <div className="op-settings-label">Save path</div>
          <input className="op-input" defaultValue="~/.openplan/exports/" />
        </div>
      </div>
      <div className="op-settings-section">
        <h3>// git repo</h3>
        <div className="op-settings-row">
          <div className="op-settings-label">
            Save to repo on approve
            <div className="op-settings-sub">Writes to {'<cwd>'}/.openplan/plans/ and stages with git add</div>
          </div>
          <div className="op-settings-control"><Toggle on={repo} onChange={setRepo} /></div>
        </div>
        <div className="op-settings-row">
          <div className="op-settings-label">Repo path</div>
          <input className="op-input" defaultValue=".openplan/plans/" />
        </div>
      </div>
    </>
  );
};

const SettingsSharing: React.FC = () => {
  const [enabled, setEnabled] = React.useState(true);
  return (
    <div className="op-settings-section">
      <h3>// share urls</h3>
      <div className="op-settings-row">
        <div className="op-settings-label">
          Enable sharing
          <div className="op-settings-sub">Generate links via paste relay for large plans</div>
        </div>
        <div className="op-settings-control"><Toggle on={enabled} onChange={setEnabled} /></div>
      </div>
      <div className="op-settings-row">
        <div className="op-settings-label">Relay URL</div>
        <input className="op-input" defaultValue="https://relay-openplan.smithgajjar.dev" />
      </div>
    </div>
  );
};

const SettingsAppearance: React.FC = () => (
  <div className="op-settings-section">
    <h3>// appearance</h3>
    <div className="op-settings-row">
      <div className="op-settings-label">Theme</div>
      <div className="op-settings-control"><Bracket hasChevron>system</Bracket></div>
    </div>
    <div className="op-settings-row">
      <div className="op-settings-label">Plan body font</div>
      <div className="op-settings-control"><Bracket hasChevron>Georgia</Bracket></div>
    </div>
    <div className="op-settings-row">
      <div className="op-settings-label">Density</div>
      <div className="op-settings-control"><Bracket hasChevron>comfortable</Bracket></div>
    </div>
  </div>
);

const SettingsIntegrations: React.FC = () => {
  const [obs, setObs] = React.useState(false);
  const [notion, setNotion] = React.useState(false);
  return (
    <>
      <div className="op-settings-section">
        <h3>// obsidian</h3>
        <div className="op-settings-row">
          <div className="op-settings-label">Enabled</div>
          <div className="op-settings-control"><Toggle on={obs} onChange={setObs} /></div>
        </div>
        <div className="op-settings-row">
          <div className="op-settings-label">Vault path</div>
          <input className="op-input" placeholder="~/Documents/MyVault" />
        </div>
      </div>
      <div className="op-settings-section">
        <h3>// notion</h3>
        <div className="op-settings-row">
          <div className="op-settings-label">Enabled</div>
          <div className="op-settings-control"><Toggle on={notion} onChange={setNotion} /></div>
        </div>
        <div className="op-settings-row">
          <div className="op-settings-label">Token</div>
          <input className="op-input" type="password" placeholder="secret_•••••••" />
        </div>
      </div>
    </>
  );
};

const SettingsAdvanced: React.FC = () => (
  <div className="op-settings-section">
    <h3>// advanced</h3>
    <div className="op-settings-row">
      <div className="op-settings-label">
        After-decision close delay
        <div className="op-settings-sub">Time before browser tab auto-closes after approve/deny</div>
      </div>
      <div className="op-settings-control"><Bracket hasChevron>3s countdown</Bracket></div>
    </div>
    <div className="op-settings-row">
      <div className="op-settings-label">Port</div>
      <input className="op-input" defaultValue="7432" style={{ width: 100 }} />
    </div>
  </div>
);

type Section = 'save' | 'sharing' | 'appearance' | 'integrations' | 'advanced';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'save', label: 'Save & sync' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'advanced', label: 'Advanced' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [section, setSection] = React.useState<Section>('save');

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="op-overlay" onClick={onClose}>
      <div
        className="op-modal"
        style={{ width: 'min(880px, 92vw)', height: 'min(640px, 88vh)', display: 'flex', flexDirection: 'column', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="op-modal-head">
          <span className="op-modal-title">// settings · ~/.openplan/config.json</span>
          <Button kind="ghost" size="sm" onClick={onClose}>esc</Button>
        </div>
        <div className="op-settings">
          <div className="op-settings-nav">
            {SECTIONS.map(s => (
              <div
                key={s.id}
                className={`op-settings-nav-item ${section === s.id ? 'is-active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </div>
            ))}
          </div>
          <div className="op-settings-content">
            {section === 'save' && <SettingsSave />}
            {section === 'sharing' && <SettingsSharing />}
            {section === 'appearance' && <SettingsAppearance />}
            {section === 'integrations' && <SettingsIntegrations />}
            {section === 'advanced' && <SettingsAdvanced />}
          </div>
        </div>
      </div>
    </div>
  );
};
