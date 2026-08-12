import { ProjectSession } from "../types";

export type Step = 1 | 2 | 3;

// Satu path per langkah. Sengaja tidak memuat id proyek: proyek yang sedang
// dibuka sudah diingat di localStorage, dan menaruhnya di URL berarti setiap
// tautan yang dibagikan menunjuk sesi yang hanya ada di mesin pengirimnya.
export const STEP_PATHS: Record<Step, string> = {
  1: "/plan",
  2: "/prd",
  3: "/tasks",
};

export const pathToStep = (pathname: string): Step | null => {
  const entry = (Object.entries(STEP_PATHS) as [string, string][]).find(([, p]) => p === pathname);
  return entry ? (Number(entry[0]) as Step) : null;
};

// Aturannya sama dengan kunci di sidebar: URL tidak boleh membuka langkah yang
// belum punya bahan.
export const isStepReachable = (step: Step, session: ProjectSession): boolean => {
  if (step === 2) return Boolean(session.plan);
  if (step === 3) return Boolean(session.prd);
  return true;
};
