import { Router } from 'express';
import express from 'express';

const router = Router();

// Endpoint for Speech-to-Text via ElevenLabs Scribe
router.post('/stt', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  console.log(`[STT Route] Received STT request. Headers:`, req.headers);
  try {
    const audioBuffer = req.body;
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      console.error('[STT Route] Audio buffer missing or invalid.');
      return res.status(400).json({ success: false, message: 'Audio buffer is required' });
    }
    console.log(`[STT Route] Audio buffer size: ${audioBuffer.length} bytes`);

    const elevenLabsApiKey = (req.headers['x-api-key'] as string) || process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('[STT Route] No ElevenLabs API key in environment or headers.');
      return res.status(500).json({ success: false, message: 'No ElevenLabs API key provided' });
    }

    // Convert Buffer to a Blob for FormData
    const contentType = req.headers['content-type'] || 'audio/webm';
    console.log(`[STT Route] Using content-type for blob: ${contentType}`);
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: contentType });
    
    let ext = 'webm';
    if (contentType.includes('mp4')) ext = 'mp4';
    if (contentType.includes('mpeg')) ext = 'mp3';
    if (contentType.includes('ogg')) ext = 'ogg';
    
    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model_id', 'scribe_v1');

    console.log(`[STT Route] Sending to ElevenLabs api...`);
    const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-text`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey
      },
      body: formData
    });

    console.log(`[STT Route] ElevenLabs API responded with status: ${response.status}`);
    if (!response.ok) {
      const errText = await response.text();
      console.error('[STT Route] ElevenLabs STT failed:', response.status, errText);
      throw new Error(`ElevenLabs API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    console.log(`[STT Route] Transcription success: "${data.text}"`);
    res.json({ success: true, text: data.text });
  } catch (error) {
    console.error('[STT Route] Error in STT proxy:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: String(error) });
  }
});

router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    const elevenLabsApiKey = (req.headers['x-api-key'] as string) || process.env.ELEVENLABS_API_KEY;
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

    if (!elevenLabsApiKey) {
      // If no API key, gracefully fallback by telling the client to use browser TTS
      return res.status(200).json({ success: false, fallback: true, message: 'No ElevenLabs API key provided' });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey
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

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (error) {
    console.error('Error in TTS proxy:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
