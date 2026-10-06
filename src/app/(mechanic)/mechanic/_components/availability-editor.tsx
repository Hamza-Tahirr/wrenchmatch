"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { fieldId } from "@/components/ui/field-id";
import { FieldError, FieldHint, firstError } from "@/components/ui/field-message";
import { Select } from "@/components/ui/select";
import { formatMinuteOfDay } from "@/lib/time";
import {
  minutesToTimeInput,
  parseTimeOfDay,
  WEEKDAYS,
  type AvailabilityRowValues,
  type FieldErrors,
} from "@/lib/validation/mechanic";

import { TAP } from "./tap";

// Weekly availability grid: per weekday a checkbox and one or more start/end windows in
// 30-minute steps. Inputs are named availability.<i>.weekday|start|end with a running
// index over the enabled days (Monday first), so server errors such as
// "availability.2.end" point at the right row.

type WindowRow = { key: number; start: string; end: string };
type DayState = { weekday: number; enabled: boolean; windows: WindowRow[] };

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const MAX_WINDOWS_PER_DAY = 4;
const DEFAULT_START = "08:00";
const DEFAULT_END = "17:00";

const START_CHOICES = Array.from({ length: 48 }, (_, step) => step * 30);
const END_CHOICES = Array.from({ length: 48 }, (_, step) => (step + 1) * 30);

type Choice = { value: string; label: string };

function choicesFor(minutes: readonly number[], current: string, isEnd: boolean): Choice[] {
  const choices = minutes.map((minute) => ({
    value: minutesToTimeInput(minute),
    label: minute === 1440 ? "12:00 AM (midnight)" : formatMinuteOfDay(minute),
  }));
  // Keep a saved value that isn't on the 30-minute grid (e.g. 08:15) selectable.
  const parsed = parseTimeOfDay(current, { isEnd });
  if (parsed !== null && !choices.some((choice) => choice.value === current)) {
    choices.push({ value: current, label: formatMinuteOfDay(parsed) });
    choices.sort((a, b) => (parseTimeOfDay(a.value, { isEnd }) ?? 0) - (parseTimeOfDay(b.value, { isEnd }) ?? 0));
  }
  return choices;
}

function initialDays(rows: readonly AvailabilityRowValues[]): { days: DayState[]; nextKey: number } {
  let nextKey = 0;
  const days = DISPLAY_ORDER.map((weekday): DayState => {
    const windows = rows
      .filter((row) => row.weekday.trim() === String(weekday))
      .map((row) => ({ key: nextKey++, start: row.start || DEFAULT_START, end: row.end || DEFAULT_END }));
    return windows.length > 0
      ? { weekday, enabled: true, windows }
      : { weekday, enabled: false, windows: [{ key: nextKey++, start: DEFAULT_START, end: DEFAULT_END }] };
  });
  return { days, nextKey };
}

/** Labels for FormErrorSummary ("availability.3.end" -> "Thursday end time"), from the submitted rows. */
export function availabilityFieldLabels(rows: readonly AvailabilityRowValues[]): Record<string, string> {
  const labels: Record<string, string> = { availability: "Weekly availability" };
  rows.forEach((row, index) => {
    const day = WEEKDAYS.find((entry) => String(entry.value) === row.weekday.trim())?.label ?? "Availability";
    labels[`availability.${index}.weekday`] = `${day} day`;
    labels[`availability.${index}.start`] = `${day} start time`;
    labels[`availability.${index}.end`] = `${day} end time`;
  });
  return labels;
}

type PresetName = "weekdays" | "everyday" | "clear";

export function AvailabilityEditor({
  rows,
  errors,
  hint,
}: {
  rows: readonly AvailabilityRowValues[];
  errors: FieldErrors;
  hint?: string;
}) {
  const [{ days }, setEditor] = useState(() => initialDays(rows));

  function update(weekday: number, change: (day: DayState) => DayState) {
    setEditor((current) => ({
      ...current,
      days: current.days.map((day) => (day.weekday === weekday ? change(day) : day)),
    }));
  }

  function addWindow(weekday: number) {
    setEditor((current) => ({
      nextKey: current.nextKey + 1,
      days: current.days.map((day) => {
        if (day.weekday !== weekday) return day;
        const last = day.windows[day.windows.length - 1];
        // Suggest the hour after the last window, e.g. 17:00-18:00.
        const start = last?.end && last.end !== "00:00" ? last.end : DEFAULT_START;
        const startMinute = parseTimeOfDay(start) ?? 480;
        const end = minutesToTimeInput(Math.min(startMinute + 60, 1440));
        return { ...day, windows: [...day.windows, { key: current.nextKey, start, end }] };
      }),
    }));
  }

  function applyPreset(preset: PresetName) {
    setEditor((current) => {
      let key = current.nextKey;
      const days = current.days.map((day): DayState => {
        const weekend = day.weekday === 0 || day.weekday === 6;
        const enabled = preset === "everyday" || (preset === "weekdays" && !weekend);
        const end = preset === "everyday" ? "18:00" : DEFAULT_END;
        return { weekday: day.weekday, enabled, windows: [{ key: key++, start: DEFAULT_START, end }] };
      });
      return { days, nextKey: key };
    });
  }

  // First input index of each day: windows of enabled days are numbered in display order.
  const offsets = days.reduce<number[]>(
    (acc, day, position) => [...acc, (acc[position] ?? 0) + (day.enabled ? day.windows.length : 0)],
    [0],
  );
  const groupError = firstError(errors.availability);
  const groupId = fieldId("availability");
  const hintId = hint ? `${groupId}-hint` : undefined;
  const errorId = groupError ? `${groupId}-error` : undefined;
  const enabledCount = days.filter((day) => day.enabled).length;

  return (
    <fieldset
      id={groupId}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      className="space-y-3"
    >
      <legend className="text-sm font-medium text-fg">
        Weekly availability
        <span aria-hidden="true" className="ml-0.5 text-danger-700">
          *
        </span>
      </legend>
      {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">Quick fill:</span>
        <Button size="sm" variant="secondary" onClick={() => applyPreset("weekdays")} className={TAP}>
          Weekdays 8 AM–5 PM
        </Button>
        <Button size="sm" variant="secondary" onClick={() => applyPreset("everyday")} className={TAP}>
          Every day 8 AM–6 PM
        </Button>
        <Button size="sm" variant="ghost" onClick={() => applyPreset("clear")} className={TAP}>
          Clear all
        </Button>
      </div>
      {groupError ? <FieldError id={errorId} message={groupError} /> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-2/40">
        {days.map((day, position) => {
          const dayInfo = WEEKDAYS[day.weekday];
          const checkboxId = `availability-day-${day.weekday}`;
          return (
            <li
              key={day.weekday}
              className={day.enabled ? "bg-neon-cyan/[0.03] px-4 py-3 transition-colors sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-4" : "px-4 py-3 transition-colors sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-4"}
            >
              {/* The whole row height is the tap target (44 px on phones). */}
              <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-fg sm:min-h-10">
                <input
                  type="checkbox"
                  id={checkboxId}
                  checked={day.enabled}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    update(day.weekday, (current) => ({ ...current, enabled }));
                  }}
                  className="size-5 shrink-0 cursor-pointer rounded accent-neon-cyan"
                />
                {dayInfo.label}
              </label>
              {day.enabled ? (
                <ul className="mt-2 space-y-2 sm:mt-0">
                  {day.windows.map((window, windowPosition) => {
                    const index = (offsets[position] ?? 0) + windowPosition;
                    const startName = `availability.${index}.start`;
                    const endName = `availability.${index}.end`;
                    const message =
                      firstError(errors[startName]) ??
                      firstError(errors[endName]) ??
                      firstError(errors[`availability.${index}.weekday`]);
                    const messageId = message ? `${fieldId(startName)}-error` : undefined;
                    const windowLabel = day.windows.length > 1 ? `${dayInfo.label}, hours ${windowPosition + 1}` : dayInfo.label;
                    return (
                      <li key={window.key}>
                        <input type="hidden" name={`availability.${index}.weekday`} value={String(day.weekday)} />
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="grid flex-1 grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                          <Select
                            id={fieldId(startName)}
                            name={startName}
                            aria-label={`${windowLabel}: start time`}
                            aria-invalid={errors[startName] ? true : undefined}
                            aria-describedby={messageId}
                            value={window.start}
                            onChange={(event) => {
                              const start = event.currentTarget.value;
                              update(day.weekday, (current) => ({
                                ...current,
                                windows: current.windows.map((row) => (row.key === window.key ? { ...row, start } : row)),
                              }));
                            }}
                          >
                            {choicesFor(START_CHOICES, window.start, false).map((choice) => (
                              <option key={choice.value} value={choice.value}>
                                {choice.label}
                              </option>
                            ))}
                          </Select>
                          <span aria-hidden="true" className="hidden text-sm text-fg-muted sm:block">
                            to
                          </span>
                          <Select
                            id={fieldId(endName)}
                            name={endName}
                            aria-label={`${windowLabel}: end time`}
                            aria-invalid={errors[endName] ? true : undefined}
                            aria-describedby={messageId}
                            value={window.end}
                            onChange={(event) => {
                              const end = event.currentTarget.value;
                              update(day.weekday, (current) => ({
                                ...current,
                                windows: current.windows.map((row) => (row.key === window.key ? { ...row, end } : row)),
                              }));
                            }}
                          >
                            {choicesFor(END_CHOICES, window.end, true).map((choice) => (
                              <option key={choice.value} value={choice.value}>
                                {choice.label}
                              </option>
                            ))}
                          </Select>
                          </div>
                          {day.windows.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                update(day.weekday, (current) => ({
                                  ...current,
                                  windows: current.windows.filter((row) => row.key !== window.key),
                                }))
                              }
                              className="inline-flex min-h-11 items-center gap-1.5 self-end rounded-lg px-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-fg/5 hover:text-fg sm:min-h-10 sm:self-auto"
                            >
                              <X aria-hidden="true" className="size-4" />
                              <span className="sm:sr-only">Remove</span>
                              <span className="sr-only"> {windowLabel}</span>
                            </button>
                          ) : null}
                        </div>
                        {message ? <FieldError id={messageId} message={message} className="mt-1.5" /> : null}
                      </li>
                    );
                  })}
                  {day.windows.length < MAX_WINDOWS_PER_DAY ? (
                    <li>
                      <Button size="sm" variant="ghost" leadingIcon={<Plus />} onClick={() => addWindow(day.weekday)} className={TAP}>
                        Add hours
                        <span className="sr-only"> on {dayInfo.label}</span>
                      </Button>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-fg-muted sm:mt-0 sm:flex sm:min-h-10 sm:items-center">Unavailable</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {enabledCount === 0
          ? "No days selected yet. Choose at least one day you can take jobs."
          : `Available ${enabledCount} ${enabledCount === 1 ? "day" : "days"} a week. Times are local to your base area.`}
      </p>
    </fieldset>
  );
}
