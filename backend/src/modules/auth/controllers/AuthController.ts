import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/UserModel.js';
import { AuthView } from '../views/AuthView.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';

/**
 * Auth Controller — thin request handlers.
 * Parses input, calls UserModel, hands result to AuthView.
 */
export const AuthController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        throw new ValidationError('Missing required fields', {
          ...(email ? {} : { email: ['Email is required'] }),
          ...(password ? {} : { password: ['Password is required'] }),
          ...(name ? {} : { name: ['Name is required'] }),
        });
      }

      const user = await UserModel.register(email, password, name);
      const tokens = await UserModel.createSession(user.id);

      res.status(201).json(AuthView.loginResponse(user, tokens));
    } catch (error) {
      next(error);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Missing credentials', {
          ...(email ? {} : { email: ['Email is required'] }),
          ...(password ? {} : { password: ['Password is required'] }),
        });
      }

      const user = await UserModel.authenticate(email, password);
      const tokens = await UserModel.createSession(user.id);

      res.status(200).json(AuthView.loginResponse(user, tokens));
    } catch (error) {
      next(error);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('Missing refresh token', {
          refreshToken: ['Refresh token is required'],
        });
      }

      const tokens = await UserModel.refreshSession(refreshToken);

      res.status(200).json(AuthView.refreshResponse(tokens));
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await UserModel.revokeSession(refreshToken);
      }

      res.status(200).json(AuthView.logoutResponse());
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const user = await UserModel.getById(userId);

      res.status(200).json(AuthView.meResponse(user));
    } catch (error) {
      next(error);
    }
  },
};
