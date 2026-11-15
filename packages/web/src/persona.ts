export type Tone = "friendly" | "formal" | "brief";

export const TONES: { id: Tone; title: string; sample: string }[] = [
  { id: "friendly", title: "Friendly", sample: "I have asked a team member to call you back. Is there anything I can note for them?" },
  { id: "formal", title: "Formal", sample: "I have requested that a member of our staff contact you. Please let me know if there is anything I should pass on." },
  { id: "brief", title: "Brief", sample: "A team member will call you back. Anything to pass on?" }
];

// A starting point for the greeting, in the chosen tone. The owner can edit it freely.
export function suggestGreeting(business: string, name: string, tone: Tone): string {
  const who = business.trim() || "our business";
  const me = name.trim();
  if (tone === "formal") return `Good day, you have reached ${who}. ${me ? `I am ${me}, the booking assistant.` : "I am the booking assistant."} How may I help you today? You may give me your phone number to begin.`;
  if (tone === "brief") return `${who}${me ? `, ${me} here` : ""}. What do you need, and when?`;
  return me ? `Hi, I'm ${me} from ${who}. Tell me which service you want and when, or give me your phone number.` : `Hi, this is the ${who} booking assistant. Tell me which service you want and when, or give me your phone number.`;
}
