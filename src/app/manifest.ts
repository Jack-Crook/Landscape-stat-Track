import type { MetadataRoute } from "next";

/** Lets the app be added to a phone's home screen and open full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Landscape Tracker",
    short_name: "Landscape",
    description: "Jobs, receipts, profit and GST for a landscaping business",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#248a3d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [{ name: "Scan receipt", url: "/receipts/scan" }],
  };
}
