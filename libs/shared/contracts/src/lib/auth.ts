import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export interface LoginResponse {
  accessToken: string;
  user: CurrentUser;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
}

/** Languages of the UI, notifications and AI answers. A new language = translations in every module. */
export const SUPPORTED_LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(50),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
});
export type RegisterRequest = z.input<typeof registerSchema>;

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type PasswordChange = z.infer<typeof passwordChangeSchema>;

/** Public server settings — needed by the login page. */
export interface AuthConfig {
  registrationEnabled: boolean;
}
