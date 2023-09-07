/** @type {import('next').NextConfig} */
const path = require('path')
 
const nextConfig = {
  reactStrictMode: true,
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
  transpilePackages: ["@scute/ui", "@scute/ui-react"]
}

module.exports = nextConfig
