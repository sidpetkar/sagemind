/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
    // Allow data URLs for base64 images
    dangerouslyAllowSVG: true,
    remotePatterns: [],
    // Add the allow data URL setting for our base64 images
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Use unoptimized: true for data URLs
    unoptimized: true,
  },
  eslint: {
    // Don't run ESLint during build in production
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  }
};

export default nextConfig;
