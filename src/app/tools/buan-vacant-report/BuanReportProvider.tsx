"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  emptyBasicInfo,
  emptyChecklist,
  type BasicInfo,
  type ChecklistAnswers,
} from "@/lib/buanVacantReport/types";

const DRAFT_KEY = "buan-vacant-draft-v1";

type Draft = {
  basic: BasicInfo;
  checklist: ChecklistAnswers;
};

type Ctx = {
  basic: BasicInfo;
  setBasic: (patch: Partial<BasicInfo>) => void;
  setBasicFull: (b: BasicInfo) => void;
  checklist: ChecklistAnswers;
  setChecklist: (patch: Partial<ChecklistAnswers>) => void;
  setChecklistFull: (c: ChecklistAnswers) => void;
  resetDraft: () => void;
};

const BuanReportContext = createContext<Ctx | null>(null);

function loadDraft(): Draft {
  if (typeof window === "undefined") {
    return { basic: emptyBasicInfo(), checklist: emptyChecklist() };
  }
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { basic: emptyBasicInfo(), checklist: emptyChecklist() };
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      basic: { ...emptyBasicInfo(), ...parsed.basic },
      checklist: { ...emptyChecklist(), ...parsed.checklist },
    };
  } catch {
    return { basic: emptyBasicInfo(), checklist: emptyChecklist() };
  }
}

export function BuanReportProvider({ children }: { children: React.ReactNode }) {
  const [basic, setBasicState] = useState<BasicInfo>(emptyBasicInfo);
  const [checklist, setChecklistState] = useState<ChecklistAnswers>(emptyChecklist);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const d = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage draft 복원
    setBasicState(d.basic);
    setChecklistState(d.checklist);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const draft: Draft = { basic, checklist };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [basic, checklist, hydrated]);

  const setBasic = useCallback((patch: Partial<BasicInfo>) => {
    setBasicState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setBasicFull = useCallback((b: BasicInfo) => {
    setBasicState(b);
  }, []);

  const setChecklist = useCallback((patch: Partial<ChecklistAnswers>) => {
    setChecklistState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setChecklistFull = useCallback((c: ChecklistAnswers) => {
    setChecklistState(c);
  }, []);

  const resetDraft = useCallback(() => {
    setBasicState(emptyBasicInfo());
    setChecklistState(emptyChecklist());
    sessionStorage.removeItem(DRAFT_KEY);
  }, []);

  const value = useMemo(
    () => ({
      basic,
      setBasic,
      setBasicFull,
      checklist,
      setChecklist,
      setChecklistFull,
      resetDraft,
    }),
    [
      basic,
      checklist,
      setBasic,
      setBasicFull,
      setChecklist,
      setChecklistFull,
      resetDraft,
    ]
  );

  return (
    <BuanReportContext.Provider value={value}>{children}</BuanReportContext.Provider>
  );
}

export function useBuanReport() {
  const ctx = useContext(BuanReportContext);
  if (!ctx) throw new Error("useBuanReport must be used within BuanReportProvider");
  return ctx;
}
