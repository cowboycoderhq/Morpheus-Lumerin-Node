// ============================================================================
// Which models the terminal is allowed to see.
//
// A starred model is advertised to grok and opencode whether or not a session
// is open — that is what stops the published list changing under an agent that
// only reads it at startup. Until now a model could only star itself, by having
// had a session, so a model you had never opened was unreachable from a
// terminal no matter how much you wanted it there. This is the manual half.
//
// Local models are never starred: they are already served, and they are
// deliberately withheld from grok (it always sends tools and stream together,
// which the local runtime always refuses), so a star on one would promise
// something that cannot happen.
// ============================================================================

/** Chain ids are hex and arrive in either case; compare them as one thing. */
const same = (a: string, b: string): boolean =>
  String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

export function isStarredModel(
  starred: readonly string[] | null | undefined,
  modelId: string,
): boolean {
  return (starred ?? []).some((id) => same(id, modelId));
}

/**
 * Toggle, preserving order.
 *
 * Order is preserved rather than sorted because this list is written into a
 * config file that a terminal agent reads: a set that reshuffles produces a
 * different file for the same content, and every rewrite is a chance for grok
 * to be looking at the moment it changes.
 */
export function toggleStarredModel(
  starred: readonly string[] | null | undefined,
  modelId: string,
): string[] {
  const id = String(modelId ?? '');
  if (!id) return [...(starred ?? [])];
  const current = starred ?? [];
  return isStarredModel(current, id)
    ? current.filter((x) => !same(x, id))
    : [...current, id];
}
