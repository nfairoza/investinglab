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
      // Rounded RM mark — preferred where SVG icons are supported.
      { src: "/brand/rm-icon-rounded.svg", sizes: "any", type: "image/svg+xml" },
      // Raster fallbacks (rounded square PNG; browsers downscale as needed).
      { src: "/brand/rm-icon-square.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/rm-icon-square.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable icon for Android adaptive icons.
      { src: "/brand/rm-icon-square.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
