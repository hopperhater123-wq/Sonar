import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 3000 = Supabase-Auth-Default-"Site URL" — Magic-Link-Redirects landen
// damit ohne Extra-Konfiguration wieder in der lokalen App.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
});
