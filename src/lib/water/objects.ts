/** Barrel: the water-objects API in one place. Code lives in things / fish / body / physics / draw and gl/. */
export * from "./things";
export * from "./fish";
export * from "./physics";
export * from "./draw";
export { poseOf, stepBody, tumble, yawOf, surfaceNormal, swimAmp } from "./body";
export { eyeFor } from "./gl/camera";
