import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles } from 'lucide-react';

interface VoiceControllerProps {
  isRecording: boolean;
  isProcessing: boolean;
  liveTranscript: string;
  onToggleRecord: () => void;
  onSendTextMessage: (text: string) => void;
  analyserNode: AnalyserNode | null;
}

export const VoiceController: React.FC<VoiceControllerProps> = ({
  isRecording,
  isProcessing,
  liveTranscript,
  onToggleRecord,
  onSendTextMessage,
  analyserNode
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Real-time audio waveform drawing
  useEffect(() => {
    if (!isRecording || !analyserNode || !canvasRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(1, '#06b6d4');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, analyserNode]);

  const demoPhrases = [
    "My AC isn't cooling properly. I need someone tomorrow evening.",
    "560064",
    "Yes, Rahul Kumar",
    "Yes, book him."
  ];

  return (
    <div className="voice-controller-panel">
      {/* Central Glowing Mic Container */}
      <div className="mic-wrapper">
        <div className={`pulse-ring ring-1 ${isRecording ? 'active' : ''}`}></div>
        <div className={`pulse-ring ring-2 ${isRecording ? 'active' : ''}`}></div>
        <div className={`pulse-ring ring-3 ${isRecording ? 'active' : ''}`}></div>

        <button
          className={`mic-button ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
          onClick={onToggleRecord}
          disabled={isProcessing}
          title={isRecording ? 'Click to Stop Speaking' : 'Click to Speak'}
        >
          {isProcessing ? (
            <div className="spinner"></div>
          ) : isRecording ? (
            <MicOff size={36} className="mic-icon animate-pulse" />
          ) : (
            <Mic size={36} className="mic-icon" />
          )}
        </button>
      </div>

      <div className="mic-label-container">
        <span className="mic-main-label">
          {isProcessing
            ? 'Make.com AI Agent Reasoning...'
            : isRecording
            ? 'Listening to your voice... (Click again to send)'
            : 'TALK TO SERVICE AGENT'}
        </span>
        <span className="mic-sub-label">
          Click the mic or speak naturally in English, Hindi, or Kannada
        </span>
      </div>

      {/* Audio Waveform Canvas */}
      {isRecording && (
        <div className="waveform-container">
          <canvas ref={canvasRef} width={280} height={40} className="waveform-canvas"></canvas>
        </div>
      )}

      {/* Live Recognized Transcript */}
      {(liveTranscript || isRecording) && (
        <div className="live-transcript-box">
          <Volume2 size={16} className="text-cyan animate-pulse" />
          <span className="live-transcript-text">
            {liveTranscript || 'Listening...'}
          </span>
        </div>
      )}

      {/* Quick Demo Scenario Buttons for Instant Presentation */}
      <div className="quick-demo-section">
        <div className="quick-demo-title">
          <Sparkles size={14} className="text-amber" />
          <span>Quick Demo Scenario Prompts:</span>
        </div>
        <div className="quick-demo-chips">
          {demoPhrases.map((phrase, idx) => (
            <button
              key={idx}
              className="quick-chip"
              onClick={() => onSendTextMessage(phrase)}
              disabled={isProcessing || isRecording}
            >
              Step {idx + 1}: "{phrase}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
