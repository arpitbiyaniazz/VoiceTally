import type { ApiResponse } from '../../../core/types/index.js';
import type { UserWithoutPassword, TokenPair } from '../models/UserModel.js';

/**
 * Auth View — response serializers.
 * Shapes model output into clean API responses.
 */
export const AuthView = {
  loginResponse(
    user: UserWithoutPassword,
    tokens: TokenPair
  ): ApiResponse<{ user: UserWithoutPassword; accessToken: string; refreshToken: string }> {
    return {
      success: true,
      data: {
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  },

  refreshResponse(
    tokens: TokenPair
  ): ApiResponse<{ accessToken: string; refreshToken: string }> {
    return {
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  },

  logoutResponse(): ApiResponse {
    return {
      success: true,
      data: { message: 'Logged out successfully' },
    };
  },

  meResponse(
    user: UserWithoutPassword | null
  ): ApiResponse<UserWithoutPassword | null> {
    return {
      success: true,
      data: user,
    };
  },
};
