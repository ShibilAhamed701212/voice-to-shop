import { Router } from 'express';
import express from 'express';

/**
 * ElevenLabs speech proxy. The API key lives only in the server environment
 * (ELEVENLABS_API_KEY) — it is never accepted from or sent to the browser.
 * Without a key the frontend uses the browser's built-in speech APIs.
 */
const router = Router();

const EXTENSIONS: [string, string][] = [['mp4', 'mp4'], ['mpeg', 'mp3'], ['ogg', 'ogg'], ['wav', 'wav'], ['webm', 'webm']];

router.post('/stt', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: 'ELEVENLABS_NOT_CONFIGURED' });

  const audio = req.body;
  if (!Buffer.isBuffer(audio) || audio.length === 0) {
    return res.status(400).json({ success: false, error: 'AUDIO_REQUIRED' });
  }

  try {
    const contentType = (req.headers['content-type'] || 'audio/webm').split(';')[0];
    const ext = EXTENSIONS.find(([needle]) => contentType.includes(needle))?.[1] ?? 'webm';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: contentType }), `audio.${ext}`);
    form.append('model_id', 'scribe_v1');
    const lang = req.query.language;
    if (typeof lang === 'string' && /^[a-z]{2,3}$/.test(lang)) form.append('language_code', lang);

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('[voice/stt] ElevenLabs error', response.status, detail.slice(0, 300));
      return res.status(502).json({ success: false, error: 'STT_UPSTREAM_ERROR', status: response.status });
    }
    const data = (await response.json()) as { text?: string };
    res.json({ success: true, text: (data.text || '').trim() });
  } catch (error) {
    console.error('[voice/stt] failed:', error);
    res.status(500).json({ success: false, error: 'STT_FAILED' });
  }
});

router.post('/tts', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 1500) : '';
  if (!text) return res.status(400).json({ success: false, error: 'TEXT_REQUIRED' });
  if (!apiKey) return res.status(200).json({ success: false, fallback: true, error: 'ELEVENLABS_NOT_CONFIGURED' });

  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey, Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        // Flash v2.5: ~75ms latency and multilingual — suited to back-and-forth voice chat.
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.05 }
      })
    });
    if (!response.ok) {
      console.error('[voice/tts] ElevenLabs error', response.status);
      return res.status(200).json({ success: false, fallback: true, error: 'TTS_UPSTREAM_ERROR' });
    }
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('[voice/tts] failed:', error);
    res.status(200).json({ success: false, fallback: true, error: 'TTS_FAILED' });
  }
});

export default router;
