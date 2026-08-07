/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // This allows production builds to successfully complete even if your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // This allows production builds to successfully complete even if your project has type errors.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;