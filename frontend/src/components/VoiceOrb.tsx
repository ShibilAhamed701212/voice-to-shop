import { Mic, Square } from 'lucide-react';
import type { VoiceStatus } from '../hooks/useAssistant';

interface Props {
  voice: VoiceStatus;
  level: number;
  onClick: () => void;
  size?: 'lg' | 'sm';
  disabled?: boolean;
}

const LABELS: Record<VoiceStatus, string> = {
  idle: 'Start talking',
  listening: 'Stop and send',
  transcribing: 'Transcribing',
  thinking: 'Thinking',
  speaking: 'Interrupt and talk'
};

export function VoiceOrb({ voice, level, onClick, size = 'lg', disabled }: Props) {
  const busy = voice === 'thinking' || voice === 'transcribing';
  // While listening the halo follows the mic level; otherwise CSS animations take over.
  const scale = voice === 'listening' ? 1 + Math.min(level, 1) * 0.55 : 1;
  return (
    <button
      type="button"
      className={`orb orb-${size} orb-${voice}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={LABELS[voice]}
      aria-pressed={voice === 'listening'}
      style={{ ['--level-scale' as string]: scale }}
    >
      <span className="orb-halo" />
      <span className="orb-ring orb-ring-1" />
      <span className="orb-ring orb-ring-2" />
      <span className="orb-core">
        {voice === 'listening' ? (
          <Square size={size === 'lg' ? 26 : 16} fill="currentColor" />
        ) : busy ? (
          <span className="orb-dots"><i /><i /><i /></span>
        ) : voice === 'speaking' ? (
          <span className="orb-bars"><i /><i /><i /><i /></span>
        ) : (
          <Mic size={size === 'lg' ? 34 : 20} />
        )}
      </span>
    </button>
  );
}
