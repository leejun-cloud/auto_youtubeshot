/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: [
      '@remotion/bundler',
      '@remotion/renderer',
      '@remotion/compositor-darwin-arm64',
      '@remotion/compositor-darwin-x64',
      '@remotion/compositor-linux-x64-gnu',
      '@remotion/compositor-linux-x64-musl',
      '@remotion/compositor-linux-arm64-gnu',
      '@remotion/compositor-linux-arm64-musl',
      '@remotion/compositor-win32-x64-msvc'
    ]
  }
}

export default nextConfig;
