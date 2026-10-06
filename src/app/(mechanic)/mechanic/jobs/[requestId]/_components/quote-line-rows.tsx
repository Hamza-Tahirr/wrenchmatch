"use client";

import { Plus, Trash2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { fieldId } from "@/components/ui/field-id";
import { FieldError, firstError } from "@/components/ui/field-message";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/mechanic";
import { QUOTE_LIMITS } from "@/lib/validation/quote";

import { TAP } from "../../../_components/tap";

// Editable line rows of the quote form. Inputs are named parts.<i>.description|quantity|unitPrice
// and taxes|fees.<i>.description|amount with i = position, so server errors such as
// "parts.1.unitPrice" land on the row the mechanic sees. Added rows slide in and removed rows
// slide out (transform/opacity; rows present on first render don't animate).

const ROW_MOTION = {
  initial: { opacity: 0, y: -10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: 28, transition: { duration: 0.18 } },
  transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
};

export type PartRow = { key: string; description: string; quantity: string; unitPrice: string };
export type AmountRow = { key: string; description: string; amount: string };

type RowsSetter<Row> = (update: (rows: Row[]) => Row[]) => void;

function updateRow<Row extends { key: string }>(setRows: RowsSetter<Row>, key: string, change: Partial<Row>) {
  setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
}

export function PartRows({ rows, setRows, errors }: { rows: PartRow[]; setRows: RowsSetter<PartRow>; errors: FieldErrors }) {
  const groupError = firstError(errors.parts);
  return (
    <fieldset id={fieldId("parts")} className="space-y-3 rounded-2xl border border-line bg-surface-2/50 p-4 sm:p-5">
      <legend className="px-1 font-mono text-xs font-semibold tracking-[0.16em] text-neon-cyan uppercase">Parts</legend>
      <p className="text-sm text-fg-muted">Itemize each part you&rsquo;ll supply. Quantity defaults to 1.</p>
      {groupError ? <FieldError message={groupError} /> : null}
      <ol className="space-y-4">
        <AnimatePresence initial={false}>
        {rows.map((row, index) => (
          <m.li
            key={row.key}
            {...ROW_MOTION}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl sm:grid-cols-[minmax(0,1fr)_5.5rem_9rem_auto] sm:items-start"
          >
            <Field label={`Part ${index + 1}`} error={errors[`parts.${index}.description`]} className="col-span-2 sm:col-span-1">
              <Input
                name={`parts.${index}.description`}
                value={row.description}
                maxLength={QUOTE_LIMITS.lineDescriptionMax}
                placeholder="Front brake pads (ceramic)"
                onChange={(event) => updateRow(setRows, row.key, { description: event.currentTarget.value })}
              />
            </Field>
            {/* Phones: quantity, price and remove share a row under the description. */}
            <div className="col-span-2 grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-3 sm:contents">
              <Field label="Qty" error={errors[`parts.${index}.quantity`]}>
                <Input
                  name={`parts.${index}.quantity`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={QUOTE_LIMITS.maxQuantity}
                  value={row.quantity}
                  onChange={(event) => updateRow(setRows, row.key, { quantity: event.currentTarget.value })}
                />
              </Field>
              <Field label="Price each (USD)" error={errors[`parts.${index}.unitPrice`]}>
                <Input
                  name={`parts.${index}.unitPrice`}
                  inputMode="decimal"
                  leadingText="$"
                  placeholder="45.00"
                  value={row.unitPrice}
                  onChange={(event) => updateRow(setRows, row.key, { unitPrice: event.currentTarget.value })}
                />
              </Field>
              <div className="flex items-end sm:pt-7">
                <Button
                  variant="ghost"
                  disabled={rows.length === 1}
                  onClick={() => setRows((items) => items.filter((item) => item.key !== row.key))}
                  aria-label={`Remove part ${index + 1}`}
                  leadingIcon={<Trash2 />}
                  className={TAP}
                />
              </div>
            </div>
          </m.li>
        ))}
        </AnimatePresence>
      </ol>
      {rows.length < QUOTE_LIMITS.maxPartRows ? (
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Plus />}
          className={TAP}
          onClick={() =>
            setRows((items) => [...items, { key: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "" }])
          }
        >
          Add part
        </Button>
      ) : null}
    </fieldset>
  );
}

export function AmountRows({
  group,
  rows,
  setRows,
  errors,
}: {
  group: "taxes" | "fees";
  rows: AmountRow[];
  setRows: RowsSetter<AmountRow>;
  errors: FieldErrors;
}) {
  const isTax = group === "taxes";
  const noun = isTax ? "Tax" : "Fee";
  const max = isTax ? QUOTE_LIMITS.maxTaxRows : QUOTE_LIMITS.maxFeeRows;
  const groupError = firstError(errors[group]);
  return (
    <fieldset id={fieldId(group)} className="space-y-3">
      <legend className="text-sm font-medium text-fg">
        {isTax ? "Taxes" : "Other fees"} <span className="font-normal text-fg-subtle">(optional)</span>
      </legend>
      <p className="text-sm text-fg-muted">
        {isTax
          ? "Add sales tax as its own line if it applies, e.g. tax on parts."
          : "Shop supplies, disposal or similar fees, each as its own line."}
      </p>
      {groupError ? <FieldError message={groupError} /> : null}
      {rows.length > 0 ? (
        <ol className="space-y-3">
          <AnimatePresence initial={false}>
          {rows.map((row, index) => (
            <m.li
              key={row.key}
              {...ROW_MOTION}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start"
            >
              <Field
                label={`${noun} ${index + 1}`}
                error={errors[`${group}.${index}.description`]}
                className="col-span-2 sm:col-span-1"
              >
                <Input
                  name={`${group}.${index}.description`}
                  value={row.description}
                  maxLength={QUOTE_LIMITS.lineDescriptionMax}
                  placeholder={isTax ? "Sales tax on parts (8.6%)" : "Shop supplies"}
                  onChange={(event) => updateRow(setRows, row.key, { description: event.currentTarget.value })}
                />
              </Field>
              <Field label="Amount (USD)" error={errors[`${group}.${index}.amount`]}>
                <Input
                  name={`${group}.${index}.amount`}
                  inputMode="decimal"
                  leadingText="$"
                  placeholder="7.83"
                  value={row.amount}
                  onChange={(event) => updateRow(setRows, row.key, { amount: event.currentTarget.value })}
                />
              </Field>
              <div className="flex items-end sm:pt-7">
                <Button
                  variant="ghost"
                  onClick={() => setRows((items) => items.filter((item) => item.key !== row.key))}
                  aria-label={`Remove ${noun.toLowerCase()} ${index + 1}`}
                  leadingIcon={<Trash2 />}
                  className={TAP}
                />
              </div>
            </m.li>
          ))}
          </AnimatePresence>
        </ol>
      ) : null}
      {rows.length < max ? (
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Plus />}
          className={TAP}
          onClick={() => setRows((items) => [...items, { key: crypto.randomUUID(), description: "", amount: "" }])}
        >
          {isTax ? "Add tax line" : "Add fee line"}
        </Button>
      ) : null}
    </fieldset>
  );
}
