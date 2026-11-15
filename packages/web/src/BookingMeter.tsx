import React from "react";
import { automatedCount, BOOKING_STEPS, featureById } from "./features.js";

// "x of 9 booking steps automated": the four that always run, plus one for each feature that is on.
export function BookingMeter({ live, compact = false }: { live: readonly string[]; compact?: boolean }) {
  const count = automatedCount(live);
  return (
    <div className="meter">
      <p className="meter__text" role="status"><strong>{count} of {BOOKING_STEPS.length}</strong> booking steps automated</p>
      <div className="meter__bar" aria-hidden="true">
        {BOOKING_STEPS.map((step) => <span key={step.label} className={!step.by || live.includes(step.by) ? "meter__cell meter__cell--on" : "meter__cell"} />)}
      </div>
      {!compact && (
        <ol className="meter__list">
          {BOOKING_STEPS.map((step) => {
            const on = !step.by || live.includes(step.by);
            return (
              <li key={step.label} className={on ? "meter__item meter__item--on" : "meter__item"}>
                {step.label}
                {!on && step.by && <span className="meter__need"> needs {featureById(step.by)?.name}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
