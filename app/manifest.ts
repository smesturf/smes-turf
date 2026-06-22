import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SMES Turf Management',
    short_name: 'SMES Turf',
    description: 'Admin and booking dashboard for SMES Turf',
    start_url: '/admin', // Opens directly to the admin panel when clicked
    display: 'standalone', // Hides browser address bar to look like a native app
    background_color: '#020617', // Slate-950 color to match your theme
    theme_color: '#a3e635', // Lime-400 accent color
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}