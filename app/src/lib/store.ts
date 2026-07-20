// Speicher-Zugriff, der unter strengen Privacy-Browsern NICHT crasht.
// Brave (Shields), Safari Private u.a. lassen localStorage werfen (SecurityError)
// statt still zu scheitern. Ohne Absicherung crasht dann die App beim Start —
// z.B. in useState-Initializern oder beim Supabase-Client — und es bleibt nur
// ein schwarzer Bildschirm. Hier faellt alles auf einen In-Memory-Fallback
// zurueck: die App laeuft, nur ueberlebt die Einstellung dann keinen Reload.

const mem = new Map<string, string>();

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return mem.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      mem.set(key, value);
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      mem.delete(key);
    }
  },
};

// Storage-Adapter im Shape, das supabase-js fuer die Session-Persistenz erwartet.
export const supabaseStorage = {
  getItem: (k: string) => store.get(k),
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.remove(k),
};
