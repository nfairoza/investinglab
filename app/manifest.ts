import type { MetadataRoute } from "next";

// PWA manifest — lets rukMoney be "Add to Home Screen" / installed as an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "rukMoney",
    short_name: "rukMoney",
    description:
      "Your banking, spending, and brokerage portfolio — unified and predicted by AI. Research and education, not financial advice.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0C0F",
    theme_color: "#0A0C0F",
    icons: [
      // Scalable mark — preferred where SVG icons are supported.
      { src: "/brand/rm-icon.svg", sizes: "any", type: "image/svg+xml" },
      // Raster fallbacks (browsers downscale the 1254² source as needed).
      { src: "/brand/ruk-app-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/ruk-app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable icon (safe-area aware) for Android adaptive icons.
      { src: "/brand/ruk-app-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
