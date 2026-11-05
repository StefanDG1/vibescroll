"use client";
import { useId, useState } from "react";
import { Check, Search } from "lucide-react";
import styles from "./onboarding.module.css";

export function SearchChoices({
  name,
  options,
  defaultValue,
  label,
}: {
  name: string;
  options: { value: string | number; label: string }[];
  defaultValue?: string;
  label: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState(
    defaultValue ?? String(options[0]?.value ?? ""),
  );
  const [query, setQuery] = useState("");
  const matches = options.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const chosen = options.find((option) => String(option.value) === selected);
  // Keep the current selection visible while searching, rather than silently
  // submitting an offscreen repository or changing it on each keystroke.
  const visible =
    chosen && !matches.includes(chosen) ? [chosen, ...matches] : matches;
  return (
    <fieldset className={styles.searchChoices}>
      <legend className="sr-only">{label}</legend>
      <input type="hidden" name={name} value={selected} />
      {options.length > 5 && (
        <label className={styles.searchBox}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label={label}
            placeholder={label}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </label>
      )}
      <div className={styles.choiceList}>
        {visible.map((option) => (
          <label
            key={option.value}
            className={styles.optionRow}
            data-selected={selected === String(option.value)}
          >
            <input
              type="radio"
              name={`${id}-choice`}
              value={String(option.value)}
              checked={selected === String(option.value)}
              onChange={() => setSelected(String(option.value))}
            />
            <span>{option.label}</span>
            {selected === String(option.value) && (
              <Check size={17} aria-hidden="true" />
            )}
          </label>
        ))}
        {query && matches.length === 0 && (
          <output className={styles.footnote}>
            No matches. Try another name.
          </output>
        )}
      </div>
    </fieldset>
  );
}
