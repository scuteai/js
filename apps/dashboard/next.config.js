const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  sassOptions: {
    includePaths: [path.join(__dirname, "styles")],
  },
  transpilePackages: ["@scute/ui", "@scute/ui-react"],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
