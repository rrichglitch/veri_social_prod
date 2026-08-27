/**
 * Client-side heuristic name matching (mirrors backend logic).
 */

const NICKNAME_MAP: Record<string, string[]> = {
  mike: ['michael'],
  matt: ['matthew'],
  mark: ['marcus', 'markus'],
  nick: ['nicholas'],
  chris: ['christopher', 'christian', 'christine'],
  jen: ['jennifer'],
  jenn: ['jennifer'],
  liz: ['elizabeth'],
  beth: ['elizabeth'],
  betty: ['elizabeth'],
  andy: ['andrew'],
  drew: ['andrew'],
  jim: ['james'],
  jimmy: ['james'],
  jamie: ['james'],
  tom: ['thomas'],
  tommy: ['thomas'],
  dave: ['david'],
  sam: ['samuel'],
  sammy: ['samuel'],
  alex: ['alexander'],
  al: ['alexander', 'alan', 'albert'],
  rob: ['robert'],
  bob: ['robert'],
  bobby: ['robert'],
  bill: ['william'],
  billy: ['william'],
  will: ['william'],
  liam: ['william'],
  steve: ['stephen', 'steven'],
  joe: ['joseph'],
  joey: ['joseph'],
  dan: ['daniel'],
  danny: ['daniel'],
  ben: ['benjamin'],
  benny: ['benjamin'],
  tony: ['anthony'],
  rich: ['richard'],
  dick: ['richard'],
  rick: ['richard'],
  ricky: ['richard'],
  ted: ['edward'],
  ed: ['edward'],
  eddy: ['edward'],
  jon: ['jonathan'],
  johnny: ['john'],
  jack: ['john', 'jacob', 'jackson'],
  jake: ['jacob'],
  pete: ['peter'],
  phil: ['philip', 'phillip'],
  doug: ['douglas'],
  greg: ['gregory'],
  jeff: ['jeffrey'],
  ken: ['kenneth'],
  kenny: ['kenneth'],
  larry: ['lawrence'],
  marty: ['martin'],
  nate: ['nathan'],
  nat: ['nathan', 'natalie'],
  pat: ['patrick', 'patricia'],
  patty: ['patricia', 'patrick'],
  ray: ['raymond'],
  ron: ['ronald'],
  ronny: ['ronald'],
  tim: ['timothy'],
  timmy: ['timothy'],
  vince: ['vincent'],
  vinny: ['vincent'],
  walt: ['walter'],
  zack: ['zachary'],
  zak: ['zachary'],
  kris: ['christopher', 'kristopher', 'kristen'],
  kate: ['katherine', 'catherine', 'kathryn'],
  katie: ['katherine', 'catherine', 'kathryn'],
  kathy: ['katherine', 'catherine', 'kathryn'],
  meg: ['margaret', 'megan'],
  peggy: ['margaret'],
  marge: ['margaret'],
  maggie: ['margaret', 'megan'],
  sue: ['susan', 'suzanne'],
  susie: ['susan', 'suzanne'],
  becky: ['rebecca'],
  becca: ['rebecca'],
  deb: ['deborah', 'debra'],
  debbie: ['deborah', 'debra'],
  libby: ['elizabeth'],
  lizzy: ['elizabeth'],
  ellie: ['elizabeth', 'eleanor'],
  nancy: ['ann', 'anne', 'anna'],
  annie: ['ann', 'anne', 'anna'],
  dottie: ['dorothy'],
  dot: ['dorothy'],
  frank: ['francis', 'franklin'],
  frankie: ['francis', 'franklin'],
  hank: ['henry'],
  harry: ['henry', 'harold'],
  hal: ['henry', 'harold', 'harry'],
  chuck: ['charles'],
  charlie: ['charles'],
  len: ['leonard'],
  lenny: ['leonard'],
  leo: ['leonard', 'leonardo', 'leopold'],
  moe: ['maurice', 'morris'],
  ollie: ['oliver'],
};

function buildNicknameLookup(): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>();

  function add(a: string, b: string) {
    if (!lookup.has(a)) lookup.set(a, new Set());
    lookup.get(a)!.add(b);
  }

  for (const [nickname, legals] of Object.entries(NICKNAME_MAP)) {
    for (const legal of legals) {
      add(nickname, legal);
      add(legal, nickname);
    }
  }

  return lookup;
}

const NICKNAME_LOOKUP = buildNicknameLookup();

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function tokenize(name: string): string[] {
  return name
    .split(/[^a-zA-Z]+/)
    .map(normalizeToken)
    .filter(t => t.length > 0);
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) {
    return a[0] === b[0];
  }
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const nicknames = NICKNAME_LOOKUP.get(a);
  if (nicknames && nicknames.has(b)) return true;
  return false;
}

export function isDisplayNameAcceptable(
  displayName: string,
  legalName: string
): { acceptable: boolean; reason?: string } {
  const displayTokens = tokenize(displayName);
  const legalTokens = tokenize(legalName);

  if (displayTokens.length === 0) {
    return { acceptable: false, reason: 'Display name is required' };
  }
  if (legalTokens.length === 0) {
    return { acceptable: false, reason: 'Legal name is missing' };
  }

  for (const dt of displayTokens) {
    let matched = false;
    for (const lt of legalTokens) {
      if (tokensMatch(dt, lt)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return {
        acceptable: false,
        reason: `Display name token "${dt}" does not match any part of your verified name`,
      };
    }
  }

  // Single-name legal names require an exact match
  if (legalTokens.length === 1) {
    const exactMatch = displayTokens.some(dt => dt === legalTokens[0]);
    if (!exactMatch) {
      return {
        acceptable: false,
        reason: 'Display name must exactly match your verified name',
      };
    }
    return { acceptable: true };
  }

  // Multi-name legal names: surname (last token) must be exactly present
  const surname = legalTokens[legalTokens.length - 1];
  const surnameExactMatch = displayTokens.some(dt => dt === surname);
  if (!surnameExactMatch) {
    return {
      acceptable: false,
      reason: `Your complete surname "${surname}" must be included in your display name`,
    };
  }

  // At least one display token must match a non-surname legal token
  const nonSurnameLegalTokens = legalTokens.slice(0, -1);
  const hasGivenNameMatch = displayTokens.some(dt =>
    nonSurnameLegalTokens.some(lt => tokensMatch(dt, lt))
  );

  if (!hasGivenNameMatch) {
    return {
      acceptable: false,
      reason: 'Display name must include at least one given name or initial from your verified name',
    };
  }

  return { acceptable: true };
}
