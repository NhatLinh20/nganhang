import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['adm-zip'],
  allowedDevOrigins: [
    '192.168.0.4', 
    'curriculum-folding-martha-training.trycloudflare.com',
    'truly-ronald-programmes-posters.trycloudflare.com',
    'nganhangtoan.loca.lt',
    'nganhangtoan.serveo.net',
    '3c6a4762dd672cd9-14-191-80-125.serveousercontent.com'
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "192.168.0.4:3000", 
        "localhost:3000", 
        "*.trycloudflare.com",
        "*.loca.lt",
        "*.pinggy.link",
        "*.serveo.net",
        "*.serveousercontent.com"
      ],
    },
  },
};

export default nextConfig;
