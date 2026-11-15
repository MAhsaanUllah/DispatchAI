// Caller verification helpers. A phone number alone never proves who is calling (caller ID can be spoofed),
// so the caller must state something on the account: the service address (onsite) or the full name (instore).

const ABBREVIATIONS: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", boulevard: "blvd", drive: "dr", lane: "ln", court: "ct", place: "pl",
  terrace: "ter", parkway: "pkwy", highway: "hwy", north: "n", south: "s", east: "e", west: "w", apartment: "apt", suite: "ste"
};

const words = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).map((word) => ABBREVIATIONS[word] ?? word);

// Every word of the stored address (house number included) must appear in what the caller said; extra words such as the city are fine.
export function addressMatches(stated: string, stored: string): boolean {
  const said = new Set(words(stated));
  const needed = words(stored);
  return needed.length > 0 && needed.every((word) => said.has(word));
}

// First and last name must both be said (any order, any case).
export function nameMatches(stated: string, firstName: string, lastName: string): boolean {
  const said = new Set(words(stated));
  const needed = words(`${firstName} ${lastName === "-" ? "" : lastName}`);
  return needed.length > 0 && needed.every((word) => said.has(word));
}
