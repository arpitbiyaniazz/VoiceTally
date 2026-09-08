import { api } from './client';

export const authApi = {
  register(email: string, password: string, name: string) {
    return api.post('/auth/register', { email, password, name });
  },

  login(email: string, password: string) {
    return api.post('/auth/login', { email, password });
  },

  refresh(refreshToken: string) {
    return api.post('/auth/refresh', { refreshToken });
  },

  logout(refreshToken: string) {
    return api.post('/auth/logout', { refreshToken });
  },

  me() {
    return api.get('/auth/me');
  },
};
