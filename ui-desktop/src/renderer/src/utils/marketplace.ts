// ============================================================================
// Marketplace parameters — read live from the Diamond contract.
//
// Becoming a provider is gated by three governance-owned numbers: the minimum
// stake, the fee charged per bid, and the allowed price-per-second band. The
// contracts revert if you violate any of them, so the UI must know them BEFORE
// it lets someone submit a transaction — otherwise the user pays gas to be told
// "no".
//
// They are NOT hardcoded on purpose. Each has an onlyOwner setter, so a
// hardcoded copy would silently go stale the day governance changes it and we'd
// be validating against a number that no longer exists. They are also not
// exposed by proxy-router's HTTP API (GetMinStake/GetBidFee exist in Go but no
// route publishes them), so we read them straight from the chain over the same
// ETH node the node itself is configured with — a plain eth_call via fetch, no
// new dependency.
// ============================================================================

// 4-byte selectors, i.e. keccak256(signature)[0:4]. Hardcoding a *selector* is
// safe in a way that hardcoding a *value* is not: it is part of the ABI, and it
// changes only if the function signature itself changes.
const SELECTOR = {
  // getProviderMinimumStake() -> uint256
  providerMinimumStake: '0x53c029f6',
  // getBidFee() -> uint256
  bidFee: '0x8dbb4647',
  // getMinMaxBidPricePerSecond() -> (uint256, uint256)
  minMaxBidPricePerSecond: '0x38c8ac62',
} as const;

export type MarketplaceParams = {
  providerMinimumStake: bigint;
  bidFee: bigint;
  minPricePerSecond: bigint;
  maxPricePerSecond: bigint;
};

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string,
): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || 'eth_call failed');
  }
  if (typeof json.result !== 'string') {
    throw new Error('eth_call returned no result');
  }
  return json.result;
}

// ABI-decode a return value that is a sequence of uint256 words.
const decodeWords = (hex: string): bigint[] => {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  const words: bigint[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) {
    words.push(BigInt(`0x${body.slice(i, i + 64)}`));
  }
  return words;
};

const firstWord = (hex: string): bigint => {
  const [word] = decodeWords(hex);
  if (word === undefined) throw new Error('eth_call returned an empty result');
  return word;
};

/**
 * Read the current provider/bid constraints from the Diamond.
 *
 * @param rpcUrl    an ETH node URL (the one proxy-router is configured with)
 * @param diamond   the Diamond (Morpheus marketplace) contract address
 */
export async function getMarketplaceParams(
  rpcUrl: string,
  diamond: string,
): Promise<MarketplaceParams> {
  const [stakeHex, feeHex, bandHex] = await Promise.all([
    ethCall(rpcUrl, diamond, SELECTOR.providerMinimumStake),
    ethCall(rpcUrl, diamond, SELECTOR.bidFee),
    ethCall(rpcUrl, diamond, SELECTOR.minMaxBidPricePerSecond),
  ]);

  const band = decodeWords(bandHex);
  if (band.length < 2) {
    throw new Error('getMinMaxBidPricePerSecond returned an unexpected result');
  }

  return {
    providerMinimumStake: firstWord(stakeHex),
    bidFee: firstWord(feeHex),
    minPricePerSecond: band[0],
    maxPricePerSecond: band[1],
  };
}

// ---- MOR <-> wei ----------------------------------------------------------
// MOR is an 18-decimal ERC-20. Everything on the wire is an integer number of
// wei as a decimal STRING — never a JS number, which loses precision above
// 2^53 and would silently corrupt a stake.

const DECIMALS = 18n;
const ONE = 10n ** DECIMALS;

export function morToWei(amount: string): bigint {
  const trimmed = (amount ?? '').trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error('Enter a valid amount');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > Number(DECIMALS)) {
    throw new Error(`At most ${DECIMALS} decimal places`);
  }
  const padded = fraction.padEnd(Number(DECIMALS), '0');
  return BigInt(whole || '0') * ONE + BigInt(padded || '0');
}

export function weiToMor(wei: bigint, maxFractionDigits = 8): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const whole = value / ONE;
  const fraction = (value % ONE).toString().padStart(Number(DECIMALS), '0');
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`;
}
