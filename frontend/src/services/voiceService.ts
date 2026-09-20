export class VoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recognition: any = null;
  private isRecording: boolean = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private elevenLabsApiKey: string = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
  private elevenLabsVoiceId: string = import.meta.env.VITE_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-IN';
    }
  }

  public async startRecording(
    onTranscript: (transcript: string, isFinal: boolean) => void,
    onAudioData?: (analyser: AnalyserNode) => void
  ): Promise<void> {
    if (this.isRecording) return;
    this.audioChunks = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.start();
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

      // Start Browser STT
      if (this.recognition) {
        this.recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
            onTranscript(finalTranscript, true);
          } else if (interimTranscript) {
            onTranscript(interimTranscript, false);
          }
        };

        this.recognition.onerror = (err: any) => {
          console.warn('Speech recognition status:', err.error);
        };

        this.recognition.start();
      }
    } catch (err) {
      console.error('Error starting audio recording:', err);
      throw err;
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

      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch {
          // ignore already stopped
        }
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        // Stop all audio tracks to release microphone
        this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public async sendAudio(_audioBlob: Blob): Promise<{ success: boolean; url?: string }> {
    // Modular audio dispatch (e.g. for archiving or upstream STT)
    return { success: true };
  }

  /**
   * Vocalize Agent Response via ElevenLabs or Browser SpeechSynthesis
   */
  public async speak(text: string): Promise<void> {
    if (!text) return;

    // Optional: ElevenLabs TTS if key is present
    if (this.elevenLabsApiKey) {
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.elevenLabsApiKey
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        });

        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn('ElevenLabs TTS failed, falling back to Web Speech API:', err);
      }
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
