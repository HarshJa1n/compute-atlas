/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  experimental: {
    // pdf-parse is CommonJS and is required at runtime from its lib/ path.
    // Bundling it breaks that require, and tracing misses the deep path, so the
    // package is kept external and explicitly included in the function bundle.
    serverComponentsExternalPackages: ["pdf-parse"],
    outputFileTracingIncludes: {
      "/api/evidence": ["./node_modules/pdf-parse/**"],
    },
  },
};
