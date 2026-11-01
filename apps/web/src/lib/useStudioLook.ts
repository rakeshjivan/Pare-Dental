"use client";

import { useSyncExternalStore } from "react";
import { getStudioLook, STUDIO_LOOK_DEFAULT, subscribeToStudioLook, type StudioLook } from "@/lib/studioLook";

export function useStudioLook(): StudioLook {
  return useSyncExternalStore(subscribeToStudioLook, getStudioLook, () => STUDIO_LOOK_DEFAULT);
}
