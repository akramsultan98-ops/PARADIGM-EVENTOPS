import type { NextConfig } from "next";

/**
 * Content-Security-Policy (P3). Everything is same-origin (fonts are self-hosted by next/font). Next.js needs inline
 * bootstrap scripts, so script-src keeps 'unsafe-inline' (a nonce-based policy via middleware is the documented next
 * step); dev additionally needs 'unsafe-eval' for React Refresh. Framing, plugins and foreign form targets are blocked.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit", "exceljs", "@prisma/client", "bcryptjs", "unpdf", "mammoth"],
  experimental: { serverActions: { bodySizeLimit: "21mb" } }, // just above the 20 MB upload limit (P2-G)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // HSTS: browsers honour it only over HTTPS; production must be served via TLS (see docs/DEPLOYMENT.md)
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
