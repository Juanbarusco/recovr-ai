import crypto from 'node:crypto';
import { createNeonAuth } from '@neondatabase/auth/next/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL || 'https://ep-holy-wind-a6phv8cz.neonauth.us-west-2.aws.neon.tech/neondb/auth';
const fallbackSecret = crypto.createHash('sha256').update(process.env.DATABASE_URL || 'recovr-preview-auth-secret').digest('hex');

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET || fallbackSecret,
  },
});
