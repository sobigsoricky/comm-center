import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Baileys uses optional native deps (jimp, sharp) for image handling that
  // Turbopack tries to statically bundle. Marking it as external tells Next
  // to leave the require()s as-is and resolve at runtime.
  serverExternalPackages: ['@whiskeysockets/baileys'],
};

export default nextConfig;
