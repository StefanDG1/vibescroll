import { useId } from "react";
import styles from "./credit-meter.module.css";

const format = new Intl.NumberFormat("en");

/** CostMeter-style presentation of actual integer credits, never dollar estimates. */
export function CreditMeter({
  used,
  reserved,
  available,
}: {
  used: number;
  reserved: number;
  available: number;
}) {
  const uid = useId();
  const total = used + reserved + available;
  const parts = [
    { name: "Used", value: used, kind: "used" },
    { name: "Reserved", value: reserved, kind: "reserved" },
    { name: "Available", value: available, kind: "available" },
  ];
  if (
    ![used, reserved, available, total].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    )
  )
    return <p>Credit balance unavailable.</p>;
  return (
    <div className={styles.meter} data-slot="credit-meter">
      <div className={styles.heading}>
        <span id={`${uid}-label`}>Credits in unexpired allowances</span>
        <strong>{format.format(available)} available</strong>
      </div>
      <div className={styles.track} aria-hidden="true">
        {parts.map(
          (part) =>
            part.value > 0 && (
              <span
                key={part.kind}
                data-kind={part.kind}
                style={{ flexGrow: part.value }}
              />
            ),
        )}
      </div>
      <dl className={styles.legend} aria-labelledby={`${uid}-label`}>
        {parts.map((part) => (
          <div key={part.kind}>
            <dt>
              <span
                className={styles.dot}
                data-kind={part.kind}
                aria-hidden="true"
              />
              {part.name}
            </dt>
            <dd>{format.format(part.value)}</dd>
          </div>
        ))}
      </dl>
      {total === 0 && (
        <p className="fine">No unexpired processing allowance.</p>
      )}
    </div>
  );
}
