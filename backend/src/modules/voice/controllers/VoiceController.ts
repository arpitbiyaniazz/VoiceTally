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
};
