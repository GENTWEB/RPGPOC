cat << 'EOF' > client/src/components/RightDrawer.jsx
import React, { useState } from 'react';
import { Backpack, Users, Grid, Compass, Image } from 'lucide-react';
import InventoryTab from './InventoryTab';
import SquadTab from './SquadTab';
import TacticalGridTab from './TacticalGridTab';
import LoreTelemetryTab from './LoreTelemetryTab';

const TABS = [
  { id: 'inventory', label: 'Gear', icon: Backpack },
  { id: 'squad', label: 'Squad', icon: Users },
  { id: 'grid', label: 'Grid', icon: Grid },
  { id: 'lore', label: 'Lore', icon: Compass },
];

export default function RightDrawer() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [imageMode, setImageMode] = useState(
    () => localStorage.getItem('delaval_image_mode') || 'prompt_only'
  );

  const handleImageModeChange = (val) => {
    setImageMode(val);
    localStorage.setItem('delaval_image_mode', val);
    window.dispatchEvent(new Event('delaval-image-mode-change'));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <nav className="grid grid-cols-4 border-b border-slate-800 bg-[#161d26] shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`py-3 flex flex-col items-center gap-1 text-[11px] font-mono border-b-2 transition ${
                active
                  ? 'border-amber-500 text-amber-400 bg-[#0f1419]/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'squad' && <SquadTab />}
        {activeTab === 'grid' && <TacticalGridTab />}
        {activeTab === 'lore' && <LoreTelemetryTab />}
      </div>

      {/* Compact Image Preference Footer */}
      <div
        data-help-title="Image Generation Mode"
        data-help="Choose whether NPC level-ups and scenes give you free copyable art prompts, stay text-only, or auto-generate using a paid Nano Banana 2 key."
        className="shrink-0 px-3 py-2 border-t border-slate-800 bg-[#0f1419] flex items-center justify-between gap-2"
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-400 shrink-0">
          <Image className="w-3.5 h-3.5 text-amber-400" /> Art
        </span>
        <select
          value={imageMode}
          onChange={(e) => handleImageModeChange(e.target.value)}
          className="flex-1 bg-[#161d26] border border-slate-700 rounded-md px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-500"
        >
          <option value="prompt_only">Copyable Prompts (Free)</option>
          <option value="off">Off (Text Only)</option>
          <option value="auto">Auto-Generate (Paid API)</option>
        </select>
      </div>
    </div>
  );
}
EOF