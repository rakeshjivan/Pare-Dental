/**
 * Build 80: features still in development, built into test builds only. A feature is on when its
 * NEXT_PUBLIC_PARE_<NAME> variable is "on" at build time (the native-preview release branch sets
 * it; the live release leaves it off).
 */

/** Dental Studio's digital wax-up (build 79) and Wax-up Studio (build 94), being developed further in test builds. */
export const WAXUP_ENABLED = process.env.NEXT_PUBLIC_PARE_WAXUP === "on";
/**
 * Smile Guide (build 128): the third Dental Studio tool - segment the patient's own teeth, reposition them
 * (ortho-restorative setup), reconcile gum and emergence, with an additive restoration layered on later. In
 * development in test builds only; the live release leaves it off. Kept isolated from the shared editor so it
 * cannot affect Model Builder.
 */
export const SMILE_ENABLED = process.env.NEXT_PUBLIC_PARE_SMILE === "on";
/**
 * Build 106: Model Builder (and, in test builds, Wax-up Studio) in the new studio frame - signed off for
 * the live release on 1 Nov 2026. Wax-up itself stays in test builds (shown as Coming soon in the live one).
 */
export const STUDIO_SHELL = true;
