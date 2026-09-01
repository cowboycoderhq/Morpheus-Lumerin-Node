// ============================================================================
// Which commit actually built this binary — not the same question as
// package.json's version.
//
// The app's version has stayed "1.1.4" across dozens of commits in a single
// day of work (merges, fixes, docs). "About shows 1.1.4" tells you nothing
// about which of those commits produced a given DMG — diagnosing a crash
// report cost real time re-deriving that by hand from a minified stack trace
// because there was no other way to tell. scripts/build-app.mjs overwrites
// this file with the real commit + dirty flag right before packaging.
//
// The overwrite is intentional and expected to show up as a local diff after
// `yarn app` — `git checkout -- src/shared/build-info.ts` discards it, or
// just don't commit it. This checked-in version is the fallback for `yarn
// dev` and any build path that doesn't go through build-app.mjs, where
// "dev-unbuilt" is itself informative: it means whatever produced this build
// didn't go through the front door.
// ============================================================================

export const BUILD_SHA = 'dev-unbuilt';
export const BUILD_DIRTY = false;
