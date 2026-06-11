/**
 * store/appStore.ts
 *
 * Global app state with localStorage persistence for:
 *   - the user's hair profile (required before any analysis)
 *   - the saved analysis history
 *
 * Persistence is handled manually (not zustand/middleware) so we keep tight
 * control over the storage schema and versioning.
 */

import { create } from "zustand";
import type { HistoryEntry, StoredHairProfile } from "./types";

const STORAGE_KEY = "formula-spy:v1";
const MAX_HISTORY = 50;

interface PersistedState {
  readonly version: 1;
  readonly profile: StoredHairProfile | null;
  readonly history: HistoryEntry[];
}

interface AppState {
  profile: StoredHairProfile | null;
  history: HistoryEntry[];
  hydrated: boolean;

  hydrate: () => void;
  saveProfile: (profile: StoredHairProfile) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  removeHistoryEntry: (id: string) => void;
  clearHistory: () => void;
  resetProfile: () => void;
}

function readStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      profile: parsed.profile ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return null;
  }
}

function writeStorage(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or unavailable (private mode); fail silently.
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  profile: null,
  history: [],
  hydrated: false,

  hydrate: () => {
    const stored = readStorage();
    set({
      profile: stored?.profile ?? null,
      history: stored?.history ?? [],
      hydrated: true,
    });
  },

  saveProfile: (profile) => {
    set({ profile });
    writeStorage({ version: 1, profile, history: get().history });
  },

  addHistoryEntry: (entry) => {
    const history = [entry, ...get().history].slice(0, MAX_HISTORY);
    set({ history });
    writeStorage({ version: 1, profile: get().profile, history });
  },

  removeHistoryEntry: (id) => {
    const history = get().history.filter((h) => h.id !== id);
    set({ history });
    writeStorage({ version: 1, profile: get().profile, history });
  },

  clearHistory: () => {
    set({ history: [] });
    writeStorage({ version: 1, profile: get().profile, history: [] });
  },

  resetProfile: () => {
    set({ profile: null });
    writeStorage({ version: 1, profile: null, history: get().history });
  },
}));
