export const getSessionsByUser = async (url, user, headers) => {
    if(!user || !url) {
      return;
    }

    const getSessions = async (user, offset, limit) => {
      try {
        const path = `${url}/blockchain/sessions/user?user=${user}&offset=${offset}&limit=${limit}&order=desc`;
        const response = await fetch(path, {
          headers,
          method: 'GET',
        });
        const data = await response.json();
        return data.sessions;
      }
      catch (e) {
        console.log("Error", e)
        return [];
      }
    } 
    
    const limit = 50;
    let offset = 0;
    let sessions: any[] = [];
    let all = false;

    while (!all) {
      const sessionsRes = await getSessions(user, offset, limit);
      sessions.push(...sessionsRes);

      if(sessionsRes.length != limit) {
        all = true;
      }
      else {
        offset += limit;
      }
    }

    return sessions;
}

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
  if(!modelId || !url) {
    return;
  }

  const getBidsByModels = async (modelId, offset, limit) => {
    try {
      const path = `${url}/blockchain/models/${modelId}/bids?offset=${offset}&limit=${limit}&order=desc`
      const response = await fetch(path, {
        headers,
      });
      const data = await response.json();
      return data.bids;
    }
    catch (e) {
      console.log("Error", e)
      return [];
    }
  }
  
  const limit = 50;
  let offset = 0;
  let bids: any[] = [];
  let all = false;

  while (!all) {
    const bidsRes = await getBidsByModels(modelId, offset, limit);
    bids.push(...bidsRes);

    // Compare the size of the page just fetched (not the accumulated total):
    // a model with exactly `limit` bids would otherwise loop forever.
    if(bidsRes.length != limit) {
      all = true;
    }
    else {
      offset += limit;
    }
  }

  return bids;
}

export const getBidInfoById = async (url, id, headers) => {
  try {
    const path = `${url}/blockchain/bids/${id}`
    const response = await fetch(path, {
      headers,
    });
    const data = await response.json();
    return data.bid;
  }
  catch (e) {
    console.log("Error", e)
    return undefined;
  }
}