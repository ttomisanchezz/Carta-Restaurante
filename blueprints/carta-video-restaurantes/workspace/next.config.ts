import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack es el bundler por defecto de Next 16 para dev y build.
  // No hay bloque webpack(): seria ignorado.
  reactStrictMode: true,

  // Los posters se sirven con <img> plano, no con next/image:
  //  - Cloudinary ya entrega la imagen optimizada y cacheada en su CDN,
  //  - cada transformacion de next/image en Vercel se cobra,
  //  - y next/image bloquea SVG salvo que se active dangerouslyAllowSVG,
  //    que es justo lo que usan los posters del seed.
  // Por eso no hay bloque `images.remotePatterns`.

  typescript: {
    // Nunca ignorar errores de tipos en el build. El gate es `pnpm typecheck`.
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
