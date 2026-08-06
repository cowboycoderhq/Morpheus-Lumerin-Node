// The router binds `limit` as a Go uint8, so 255 is the hard ceiling — asking
// for more does not fail loudly, it wraps. 200 keeps headroom under that while
// cutting the page count 4x.
export const SESSION_PAGE_LIMIT = 200;
// Pages fetched concurrently per round. Enough to collapse a long history into
// a couple of round trips, small enough not to open an unbounded number of
// sockets at a local router that is also serving the rest of the screen.
export const SESSION_PAGE_BATCH = 8;

const fetchSessionPage = async (url, user, headers, offset, limit) => {
  try {
    const path = `${url}/blockchain/sessions/user?user=${user}&offset=${offset}&limit=${limit}&order=desc`;
    const response = await fetch(path, {
      headers,
      method: 'GET',
    });
    const data = await response.json();
    return data.sessions;
  } catch (e) {
    console.log('Error', e);
    return [];
  }
};

export const getSessionsByUser = async (url, user, headers) => {
  if (!user || !url) {
    return;
  }

  const limit = SESSION_PAGE_LIMIT;
  let offset = 0;
  const sessions: any[] = [];
  let all = false;

  while (!all) {
    const sessionsRes = await fetchSessionPage(
      url,
      user,
      headers,
      offset,
      limit,
    );
    sessions.push(...sessionsRes);

    if (sessionsRes.length != limit) {
      all = true;
    } else {
      offset += limit;
    }
  }

  return sessions;
};

// ---- The live window ------------------------------------------------------
//
// Walking a user's ENTIRE session history to open a chat costs one chain read
// per 50 sessions, serially. That is unbounded and it grows: a rolling session
// mints one on-chain session per block, so an afternoon of testing adds pages
// that every future Chat open pays for.
//
// The screen does not need all of them to be CORRECT — it needs every session
// that could still be OPEN, so a chat with a live session is never shown as
// sessionless (which would invite paying for a second one). That set is
// bounded, and here is why:
//
//   `order=desc` reverses the on-chain append order (SessionRouter.
//   GetSessionsByUser → adjustOrder), so pages arrive newest-OPENED first. A
//   session cannot run longer than the chain's per-session cap, so any session
//   still open was opened after `now - cap`. Once a page's OLDEST entry was
//   opened before that, every remaining (older) session has necessarily ended.
//
// `safetyFactor` widens that window because the cap is governance-settable: if
// it were ever LOWERED, a session opened under the older, longer cap could still
// be running past the new bound. Widening costs one extra page; being wrong
// costs a user a duplicate stake.
export const getLiveSessionsByUser = async (
  url,
  user,
  headers,
  maxSessionSeconds: number,
  safetyFactor = 2,
): Promise<{ sessions: any[]; nextOffset: number; complete: boolean }> => {
  if (!user || !url) {
    return { sessions: [], nextOffset: 0, complete: true };
  }

  const limit = SESSION_PAGE_LIMIT;
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - Math.max(0, maxSessionSeconds) * safetyFactor;

  let offset = 0;
  const sessions: any[] = [];

  for (;;) {
    // Pages are fetched CONCURRENTLY, in batches.
    //
    // The bound above is sound but does nothing for the case that actually
    // hurts: a user whose entire history is recent. Rolling-session testing
    // mints one on-chain session per block, so ~1450 sessions can all fall
    // inside the window — measured at 19.8 SECONDS of serial paging, which was
    // the whole Chat load time. Nothing older is skippable, so the only way to
    // go faster is to stop waiting for one page before asking for the next.
    //
    // Safe to speculate: these are idempotent reads, an over-fetched page past
    // the end simply returns empty, and the router handles concurrency well
    // (measured: 33 concurrent reads in ~6.8x the cost of one, not 33x).
    const offsets: number[] = [];
    for (let i = 0; i < SESSION_PAGE_BATCH; i++) {
      offsets.push(offset + i * limit);
    }
    const pages = await Promise.all(
      offsets.map((o) => fetchSessionPage(url, user, headers, o, limit)),
    );

    // Append in ORDER, and stop at the first short page — anything after it is
    // past the end of the history and must not be appended, or `nextOffset`
    // would no longer line up with what was actually collected.
    for (const page of pages) {
      sessions.push(...page);
      if (page.length !== limit) {
        return { sessions, nextOffset: sessions.length, complete: true };
      }
    }

    offset += SESSION_PAGE_BATCH * limit;

    // The oldest entry seen decides whether anything older could still be open.
    // OpenedAt is seconds since epoch, same clock as the chain.
    const lastPage = pages[pages.length - 1];
    const oldestOpenedAt = Math.min(
      ...lastPage
        .map((s: any) => Number(s.OpenedAt))
        .filter((n: number) => Number.isFinite(n)),
    );
    if (Number.isFinite(oldestOpenedAt) && oldestOpenedAt < cutoff) {
      return { sessions, nextOffset: sessions.length, complete: false };
    }
  }
};

// The rest of the history, from where the live window stopped. Nothing blocks on
// this — it exists so old chats can still show the session they used.
export const getSessionsFromOffset = async (
  url,
  user,
  headers,
  startOffset: number,
) => {
  if (!user || !url) {
    return [];
  }

  const limit = SESSION_PAGE_LIMIT;
  let offset = startOffset;
  const sessions: any[] = [];

  // Batched for the same reason as the live window. This one blocks nothing, but
  // it still competes with the rest of the screen for the router, so finishing
  // sooner matters even though nobody is waiting on it.
  for (;;) {
    const offsets: number[] = [];
    for (let i = 0; i < SESSION_PAGE_BATCH; i++) {
      offsets.push(offset + i * limit);
    }
    const pages = await Promise.all(
      offsets.map((o) => fetchSessionPage(url, user, headers, o, limit)),
    );
    for (const page of pages) {
      sessions.push(...page);
      if (page.length !== limit) {
        return sessions;
      }
    }
    offset += SESSION_PAGE_BATCH * limit;
  }
};

// Fetch ALL active bids by walking PROVIDERS instead of MODELS.
//
// The marketplace list used to be built with one chain request per model, which
// is why "Loading marketplace options…" ran for a long time. Every active bid
// belongs to a provider, and there are far fewer providers than models, so
// walking providers returns the identical bid set in far fewer requests — and is
// no less correct: the caller already drops any bid whose provider is not in the
// provider map.
export const getActiveBidsByProvider = async (url, providerId, headers) => {
  if (!providerId || !url) {
    return [];
  }

  const page = async (offset, limit) => {
    try {
      const path = `${url}/blockchain/providers/${providerId}/bids/active?offset=${offset}&limit=${limit}`;
      const response = await fetch(path, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.bids ?? [];
    } catch (e) {
      console.log('Error', e);
      return [];
    }
  };

  const limit = 100;
  let offset = 0;
  const bids: any[] = [];
  // Paginate to exhaustion — a provider with more than `limit` bids would
  // otherwise be silently truncated.
  for (;;) {
    const batch = await page(offset, limit);
    bids.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return bids;
};

export const getBidsByModelId = async (url, modelId, headers) => {
  if (!modelId || !url) {
    return;
  }

  const getBidsByModels = async (modelId, offset, limit) => {
    try {
      const path = `${url}/blockchain/models/${modelId}/bids?offset=${offset}&limit=${limit}&order=desc`;
      const response = await fetch(path, {
        headers,
      });
      const data = await response.json();
      return data.bids;
    } catch (e) {
      console.log('Error', e);
      return [];
    }
  };

  const limit = 50;
  let offset = 0;
  const bids: any[] = [];
  let all = false;

  while (!all) {
    const bidsRes = await getBidsByModels(modelId, offset, limit);
    bids.push(...bidsRes);

    // Compare the size of the page just fetched (not the accumulated total):
    // a model with exactly `limit` bids would otherwise loop forever.
    if (bidsRes.length != limit) {
      all = true;
    } else {
      offset += limit;
    }
  }

  return bids;
};

export const getBidInfoById = async (url, id, headers) => {
  try {
    const path = `${url}/blockchain/bids/${id}`;
    const response = await fetch(path, {
      headers,
    });
    const data = await response.json();
    return data.bid;
  } catch (e) {
    console.log('Error', e);
    return undefined;
  }
};
