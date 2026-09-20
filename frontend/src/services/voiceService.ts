export class VoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;

  constructor() {
    // No longer using window.SpeechRecognition
  }

  public async startRecording(
    _onTranscript: (transcript: string, isFinal: boolean) => void,
    onAudioData?: (analyser: AnalyserNode) => void
  ): Promise<void> {
    if (this.isRecording) return;
    this.audioChunks = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone permission: granted');
      
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.start(200); // collect chunks every 200ms
      console.log('Recorder: started');
      this.isRecording = true;

      // Setup audio analyzer for waveform visualizer
      if (onAudioData) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.microphone.connect(this.analyser);
        onAudioData(this.analyser);
      }
    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      let errorMsg = 'Microphone permission is required.';
      if (err.name === 'NotAllowedError') errorMsg = 'Microphone access was denied. Please allow it in your browser settings.';
      if (err.name === 'NotFoundError') errorMsg = 'No microphone device was found.';
      if (err.name === 'NotReadableError') errorMsg = 'Microphone is already in use by another application.';
      if (err.name === 'SecurityError') errorMsg = 'Security error: microphone access is blocked.';
      alert(errorMsg);
      throw new Error(errorMsg);
    }
  }

  public stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        this.isRecording = false;
        resolve(null);
        return;
      }

      this.isRecording = false;

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }

      this.mediaRecorder.onstop = () => {
        console.log('Recorder: stopped');
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log(`Audio blob size: ${audioBlob.size} bytes`);
        console.log(`Audio MIME: ${audioBlob.type}`);
        
        // Stop all audio tracks to release microphone
        this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public async sendAudio(audioBlob: Blob): Promise<{ success: boolean; text?: string }> {
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || '';
      const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
      const response = await fetch(`${BASE_URL}/api/voice/stt`, {
        method: 'POST',
        headers: {
          'Content-Type': audioBlob.type,
          'x-api-key': apiKey
        },
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error(`STT API failed: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, text: data.text };
    } catch (err) {
      console.error('STT Pipeline Error:', err);
      return { success: false };
    }
  }

  /**
   * Vocalize Agent Response via ElevenLabs or Browser SpeechSynthesis
   */
  public async speak(text: string): Promise<void> {
    if (!text) return;

    // Call backend proxy for TTS
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || '';
      const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
      const response = await fetch(`${BASE_URL}/api/voice/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ text })
      });

      if (response.ok) {
        // Check if the server fell back to browser TTS
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const json = await response.json();
          if (json.fallback) {
             console.log('Backend signaled to fallback to browser TTS:', json.message);
          }
        } else {
          // Play the audio
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          await audio.play();
          return;
        }
      }
    } catch (err) {
      console.warn('Backend TTS failed, falling back to Web Speech API:', err);
    }

    // Default Browser SpeechSynthesis (Reliable, Zero latency, Zero cost)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any active speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-IN';
      window.speechSynthesis.speak(utterance);
    }
  }
}

export const voiceService = new VoiceService();
