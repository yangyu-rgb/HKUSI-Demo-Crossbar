import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { PredictionQueryInput, PredictionResponse } from "../features/prediction/types";


type StoredSession = {
  query: PredictionQueryInput | null;
  prediction: PredictionResponse | null;
  predictionStale: boolean;
};

type MobileSessionValue = StoredSession & {
  savePrediction: (query: PredictionQueryInput, prediction: PredictionResponse) => void;
  markPredictionStale: () => void;
};

const STORAGE_KEY = "crossborder-mobile-session";
const MobileSessionContext = createContext<MobileSessionValue | null>(null);


function readStoredSession(): StoredSession {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredSession;
  } catch {
    // A fresh in-memory session is enough when browser storage is unavailable.
  }
  return { query: null, prediction: null, predictionStale: false };
}


export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredSession>(readStoredSession);

  function persist(next: StoredSession) {
    setState(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the current navigation session usable without persistent storage.
    }
  }

  const value = useMemo<MobileSessionValue>(() => ({
    ...state,
    savePrediction: (query, prediction) => persist({ query, prediction, predictionStale: false }),
    markPredictionStale: () => persist({ ...state, predictionStale: Boolean(state.prediction) }),
  }), [state]);

  return <MobileSessionContext.Provider value={value}>{children}</MobileSessionContext.Provider>;
}


export function useMobileSession() {
  const value = useContext(MobileSessionContext);
  if (!value) throw new Error("useMobileSession must be used inside MobileSessionProvider");
  return value;
}
