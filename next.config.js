/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable server-side features
  experimental: {
    serverActions: true,
  },
  // Webpack config for native modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('better-sqlite3', 'sqlite-vec')
      
      // Externalize pdf-parse and pdfjs-dist to avoid webpack bundling issues
      config.externals.push({
        'pdf-parse': 'commonjs pdf-parse',
        'pdfjs-dist': 'commonjs pdfjs-dist',
      })
      
      // Ignore canvas and canvas-prebuilt (optional dependencies of pdfjs-dist)
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        'canvas-prebuilt': false,
      }
    }
    return config
  },
}

module.exports = nextConfig

