import type { Request, Response, NextFunction } from 'express';
import { VoiceAgentService } from '../services/VoiceAgentService.js';
import { VoiceTelemetry } from '../observability/VoiceTelemetry.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';

export const VoiceController = {
  /**
   * Process a voice transcript or text command
   */
  async process(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      if (!userId) {
        throw new ValidationError('Authentication required');
      }

      const { transcript, text, execute } = req.body;
      const inputTranscript = transcript || text;

      if (!inputTranscript || typeof inputTranscript !== 'string' || inputTranscript.trim().length === 0) {
        throw new ValidationError('Transcript or text is required', {
          transcript: ['Cannot be empty'],
        });
      }

      const sanitizedText = inputTranscript.trim();
      if (sanitizedText.length > 500) {
        throw new ValidationError('Transcript is too long', {
          transcript: ['Maximum length is 500 characters'],
        });
      }

      // If execute is explicitly passed as true/false, honor it. Default is false (preview mode with reconfirmation).
      const shouldExecute = execute === true || execute === 'true';
      const result = await VoiceAgentService.process(userId, sanitizedText, shouldExecute);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Retrieve Voice AI observability and telemetry metrics
   */
  async getMetrics(_req: Request, res: Response): Promise<void> {
    const metrics = VoiceTelemetry.getMetrics();
    res.status(200).json({
      success: true,
      data: metrics,
    });
  },

  /**
   * Transcribe user audio query using voxtral-mini-transcribe-realtime-2602
   */
  async transcribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { audioBase64, mimeType, fileName } = req.body;

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        throw new ValidationError('audioBase64 string is required for transcription');
      }

      // Strip potential data URL prefix: "data:audio/webm;base64,..."
      const cleanedBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, '');
      const audioBuffer = Buffer.from(cleanedBase64, 'base64');

      if (audioBuffer.length === 0) {
        throw new ValidationError('Audio payload is empty');
      }

      const { VoxtralVoiceService } = await import('../services/VoxtralVoiceService.js');
      const result = await VoxtralVoiceService.transcribe(
        audioBuffer,
        mimeType || 'audio/webm',
        fileName || 'user_voice_query.webm'
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Synthesize natural speech talking using voxtral-mini-tts-2603
   */
  async tts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, voice } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new ValidationError('Text is required for TTS synthesis');
      }

      const { VoxtralVoiceService } = await import('../services/VoxtralVoiceService.js');
      const result = await VoxtralVoiceService.synthesizeSpeech(text, voice);

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('X-Voxtral-Model', result.model);
      res.setHeader('X-Voxtral-Latency-Ms', result.latencyMs.toString());
      res.status(200).send(result.audioBuffer);
    } catch (err: any) {
      // If Voxtral TTS is unavailable, return JSON error with fallback indication
      res.status(503).json({
        success: false,
        fallbackToBrowser: true,
        message: err.message || 'Voxtral TTS service unavailable',
        model: 'voxtral-mini-tts-2603',
      });
    }
  },

  /**
   * Get active Voxtral STT and TTS configuration
   */
  async getConfig(_req: Request, res: Response): Promise<void> {
    const { VoxtralVoiceService } = await import('../services/VoxtralVoiceService.js');
    res.status(200).json({
      success: true,
      data: VoxtralVoiceService.getVoiceStatus(),
    });
  },
};

