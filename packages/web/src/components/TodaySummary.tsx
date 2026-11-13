import React, { useEffect, useState } from "react";
import type { WorkOrder } from "@dispatchai/shared";

type Counts = { calls: number | null; handedOver: number };

const sameLocalDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

// "What the AI did today": calls answered, bookings made, and what it handed to a person.
// Without the phone line there are no calls to count, so it says "Off" instead of a false zero.
export function TodaySummary({ jobs }: { jobs: WorkOrder[] }) {
  const [counts, setCounts] = useState<Counts>({ calls: null, handedOver: 0 });

  useEffect(() => {
    const load = async () => {
      const inbox = await fetch("/api/inbox").then((r) => r.json()).then((b) => b.data.tasks as { closedAt?: string }[]).catch(() => []);
      const phoneOn = await fetch("/api/plugins").then((r) => r.json()).then((b) => (b.data.plugins as { id: string; enabled: boolean }[]).some((p) => p.id === "twilio" && p.enabled)).catch(() => false);
      const calls = phoneOn
        ? await fetch("/api/plugins/twilio/calls").then((r) => r.json()).then((b) => (b.data.calls as { startedAt: string }[]).filter((c) => sameLocalDay(c.startedAt)).length).catch(() => null)
        : null;
      setCounts({ calls, handedOver: inbox.filter((task) => !task.closedAt).length });
    };
    void load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  const booked = jobs.filter((job) => sameLocalDay(job.createdAt)).length;
  return (
    <section className="today" aria-labelledby="today-title">
      <h2 className="today__title" id="today-title">What the AI did today</h2>
      <dl className="today__figures">
        <div className="today__item"><dt>Calls answered</dt><dd>{counts.calls ?? "Phone off"}</dd></div>
        <div className="today__item"><dt>Bookings made</dt><dd>{booked}</dd></div>
        <div className="today__item"><dt>Waiting on you</dt><dd>{counts.handedOver}</dd></div>
      </dl>
    </section>
  );
}
