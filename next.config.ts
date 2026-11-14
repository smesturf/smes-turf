import type { NextConfig } from "next";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

const nextConfig: NextConfig = {
  // Keep resized gallery images for 30 days
  images: {
    minimumCacheTTL: THIRTY_DAYS,
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
            value: `public, max-age=${THIRTY_DAYS}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;