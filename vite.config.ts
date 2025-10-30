import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  build: {
    rollupOptions: {
      input: "index.html"
    }
  },
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
  resolve: {
    alias: {
      "fs": "src/lib/config/stubs/fs.js",
      "fs/promises": "src/lib/config/stubs/fs.js",
      "path": "src/lib/config/stubs/path.js",
      "crypto": "src/lib/config/stubs/crypto.js",
      "os": "src/lib/config/stubs/os.js",
      "events": "src/lib/config/stubs/events.js",
      "chokidar": "src/lib/config/stubs/chokidar.js",
      "process": "src/lib/config/stubs/process.js"
    }
  },
  // AWS SDK configuration for browser
  server: {
    fs: {
      allow: ['..']
    }
  }
});
