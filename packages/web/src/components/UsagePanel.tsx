import React, { useEffect, useState } from "react";

type Summary = { requests: number; failures: number; inputTokens: number; outputTokens: number; unreported: number };
type Usage = {
  ai: { enabled: boolean; provider: string | null; model: string | null; today: Summary; month: Summary; price: { input: number; output: number } | null; cost: { today: number | null; month: number | null } | null };
  twilio: { enabled: boolean; callsToday: number; account?: { balance: string; currency: string; month: { calls: number; minutes: number; spend: string; unit: string } }; error?: string };
};

// Small amounts need more digits than 2 to mean anything.
export const usd = (amount: number) => (amount === 0 ? "$0.00" : amount < 0.01 ? "under $0.01" : amount < 1 ? `$${amount.toFixed(3)}` : `$${amount.toFixed(2)}`);

const tokens = (summary: Summary) => `${summary.inputTokens.toLocaleString()} in, ${summary.outputTokens.toLocaleString()} out`;

function AiLine({ label, summary, cost }: { label: string; summary: Summary; cost: number | null | undefined }) {
  return (
    <div className="usage__row">
      <dt>{label}</dt>
      <dd>
        {summary.requests} request{summary.requests === 1 ? "" : "s"}{summary.failures ? `, ${summary.failures} failed` : ""}. {tokens(summary)} tokens.
        {cost != null && <strong> About {usd(cost)}.</strong>}
        {summary.unreported > 0 && <span className="usage__note"> {summary.unreported} answered without a token count, so they are not in these totals.</span>}
      </dd>
    </div>
  );
}

// What the AI brain and the phone line cost. Tokens are the provider's own counts; dollars are the owner's own prices
// times those tokens. Twilio's figures come from the owner's Twilio account.
export function UsagePanel() {
  const [usage, setUsage] = useState<Usage | null | "error">(null);
  const load = () => fetch("/api/usage").then((r) => (r.ok ? r.json() : Promise.reject())).then((body) => setUsage(body.data)).catch(() => setUsage("error"));
  useEffect(() => { void load(); }, []);

  return (
    <section className="usage" aria-labelledby="usage-title">
      <div className="usage__head">
        <h2 className="usage__title" id="usage-title">Usage and cost</h2>
        <button type="button" className="btn btn--sm" onClick={() => void load()}>Refresh</button>
      </div>
      {usage === null && <p className="field__hint">Reading usage…</p>}
      {usage === "error" && <p role="alert" className="field__error">Could not read usage. Try again.</p>}
      {usage && usage !== "error" && (
        <div className="usage__cards">
          <article className="usage__card" aria-label="AI brain usage">
            <h3 className="usage__name">AI brain{usage.ai.enabled && usage.ai.model ? `: ${usage.ai.model}` : ""}</h3>
            {!usage.ai.enabled ? <p className="field__hint">The AI brain is off, so nothing is being used or charged.</p> : (
              <>
                <dl className="usage__list">
                  <AiLine label="Today" summary={usage.ai.today} cost={usage.ai.cost?.today} />
                  <AiLine label="This month" summary={usage.ai.month} cost={usage.ai.cost?.month} />
                </dl>
                <p className="field__hint">{usage.ai.price
                  ? `Dollars use your prices: ${usd(usage.ai.price.input)} per million tokens in, ${usd(usage.ai.price.output)} out.`
                  : "To see dollars, add your price per million tokens in the AI brain settings. Leave it empty for a free tier."}
                {" "}Counts come from the provider's replies; your provider's bill is the one that counts.</p>
              </>
            )}
          </article>

          <article className="usage__card" aria-label="Phone line usage">
            <h3 className="usage__name">Phone line (Twilio)</h3>
            {!usage.twilio.enabled ? <p className="field__hint">The phone line is off, so no calls are being answered or charged.</p> : (
              <>
                <dl className="usage__list">
                  <div className="usage__row"><dt>Today</dt><dd>{usage.twilio.callsToday} call{usage.twilio.callsToday === 1 ? "" : "s"} answered since the server last started.</dd></div>
                  {usage.twilio.account && (
                    <>
                      <div className="usage__row"><dt>Balance</dt><dd><strong>{usage.twilio.account.balance} {usage.twilio.account.currency}</strong></dd></div>
                      <div className="usage__row"><dt>This month</dt><dd>{usage.twilio.account.month.calls} calls, {usage.twilio.account.month.minutes} minutes{usage.twilio.account.month.spend ? `, ${usage.twilio.account.month.spend} ${usage.twilio.account.month.unit} spent in total` : ""}.</dd></div>
                    </>
                  )}
                </dl>
                {usage.twilio.error && <p role="alert" className="field__error">{usage.twilio.error}</p>}
                <p className="field__hint">Balance and spend come from your Twilio account and include everything on it, not only this app.</p>
              </>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
