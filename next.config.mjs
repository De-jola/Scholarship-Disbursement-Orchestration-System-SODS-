import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * `next dev` and `next build` share `.next` by default. Running a build while a dev server is open
 * deletes the dev server's CSS/JS chunks (unstyled pages, 404s, error logs). Keep them apart.
 */
export default function config(phase) {
  return {
    reactStrictMode: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
