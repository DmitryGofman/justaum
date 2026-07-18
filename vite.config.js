import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // relative base so the build works at any mount point (GitHub Pages subpath, local preview)
  base: "./",
  plugins: [react(), tailwindcss()],
});
