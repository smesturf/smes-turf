import type { NextConfig } from "next";

const ONE_YEAR = 60 * 60 * 24 * 365;

const nextConfig: NextConfig = {
  // Keep resized gallery images for a year instead of the short default
  images: {
    minimumCacheTTL: ONE_YEAR,
  },

  // Cache only the photos folder (logo + gallery).
  // Prices, slots and bookings come from Supabase/API calls and are not affected.
  async headers() {
    return [
      {
        source: "/photos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_YEAR}, immutable`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;