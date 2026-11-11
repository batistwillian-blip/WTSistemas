import type { NextConfig } from "next";

function csp(extraStyle = "", extraFont = "") {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    `style-src 'self' 'unsafe-inline'${extraStyle}`,
    "img-src 'self' data:",
    `font-src 'self'${extraFont}`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join("; ");
}

const baseHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const securityHeaders = [...baseHeaders, { key: "Content-Security-Policy", value: csp() }];
// A Central da Aura usa as fontes do Google (mesmo visual do painel do n8n).
const auraHeaders = [...baseHeaders, { key: "Content-Security-Policy", value: csp(" https://fonts.googleapis.com", " https://fonts.gstatic.com") }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    return [
      { source: "/((?!aura$).*)", headers: securityHeaders },
      { source: "/aura", headers: auraHeaders },
    ];
  },
};

export default nextConfig;
