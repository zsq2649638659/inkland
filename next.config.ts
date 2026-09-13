import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "azcazuwcrliskkjrvnwa.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "azcazuwcrliskkjrvnwa.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  webpack(config) {
    // NSFWJS ships its model weights as UMD bundles containing an internal
    // dynamic require. They are loaded only in the browser during optional
    // image screening, so Webpack must treat those weight files as opaque.
    config.module.noParse = /[\\/]node_modules[\\/]nsfwjs[\\/]dist[\\/]models[\\/].*\.min\.js$/;
    return config;
  },
};

export default nextConfig;
