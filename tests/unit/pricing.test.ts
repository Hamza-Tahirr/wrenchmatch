import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { PLATFORM_FEE_BPS } from "@/server/config";
import { DomainError } from "@/server/errors";
import {
  computeBookingMoney,
  computeInvoiceTotals,
  computeQuoteTotals,
  lineAmountCents,
  MAX_QUOTE_ITEMS,
  platformFeeCents,
  sameQuoteTotals,
  type PricedItem,
  type QuoteTotals,
} from "@/server/pricing";

const labor = (unitPriceCents: number, quantity = 1): PricedItem => ({ kind: "labor", quantity, unitPriceCents });
const part = (unitPriceCents: number, quantity = 1): PricedItem => ({ kind: "part", quantity, unitPriceCents });

function expectInvalid(action: () => unknown, message?: RegExp): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  expect((caught as DomainError).code).toBe("invalid_input");
  if (message) expect((caught as DomainError).userMessage).toMatch(message);
}

describe("computeQuoteTotals", () => {
  it("sums each kind of line and the total", () => {
    const totals = computeQuoteTotals([
      labor(12_000),
      part(4_550),
      part(899, 4),
      { kind: "tax", quantity: 1, unitPriceCents: 712 },
      { kind: "fee", quantity: 1, unitPriceCents: 1_500 },
    ]);
    expect(totals).toEqual({
      laborCents: 12_000,
      partsCents: 4_550 + 3_596,
      taxCents: 712,
      feeCents: 1_500,
      totalCents: 12_000 + 8_146 + 712 + 1_500,
    });
  });

  it("accepts a labor-only quote with zero parts", () => {
    expect(computeQuoteTotals([labor(8_500)])).toEqual({
      laborCents: 8_500,
      partsCents: 0,
      taxCents: 0,
      feeCents: 0,
      totalCents: 8_500,
    });
  });

  it("multiplies quantity by unit price (e.g. hours of labor)", () => {
    expect(computeQuoteTotals([labor(9_500, 3)]).laborCents).toBe(28_500);
    expect(lineAmountCents({ quantity: 7, unitPriceCents: 1_299 })).toBe(9_093);
  });

  it("requires exactly one labor line", () => {
    expectInvalid(() => computeQuoteTotals([part(4_000)]), /exactly one labor line/);
    expectInvalid(() => computeQuoteTotals([labor(4_000), labor(1_000)]), /exactly one labor line/);
    expectInvalid(() => computeQuoteTotals([]));
  });

  it("rejects fractional cents and fractional quantities", () => {
    expectInvalid(() => computeQuoteTotals([labor(100.5)]));
    expectInvalid(() => computeQuoteTotals([labor(10_000), part(2_000, 1.5)]));
    expectInvalid(() => computeQuoteTotals([labor(Number.NaN)]));
    expectInvalid(() => computeQuoteTotals([labor(Number.POSITIVE_INFINITY)]));
  });

  it("rejects negative amounts and quantities", () => {
    expectInvalid(() => computeQuoteTotals([labor(-1)]));
    expectInvalid(() => computeQuoteTotals([labor(10_000), part(-500)]));
    expectInvalid(() => computeQuoteTotals([labor(10_000), part(500, -1)]));
  });

  it("enforces the database bounds on quantity, unit price and line count", () => {
    expectInvalid(() => computeQuoteTotals([labor(1_000, 0)]));
    expectInvalid(() => computeQuoteTotals([labor(1_000, 101)]));
    expect(computeQuoteTotals([labor(10_000_000, 100)]).totalCents).toBe(1_000_000_000);
    expectInvalid(() => computeQuoteTotals([labor(10_000_001)]));
    const tooMany = [labor(1_000), ...Array.from({ length: MAX_QUOTE_ITEMS }, () => part(100))];
    expectInvalid(() => computeQuoteTotals(tooMany));
  });

  it("rejects a quote whose total is $0", () => {
    expectInvalid(() => computeQuoteTotals([labor(0)]), /more than \$0/);
  });

  it("rejects unknown line kinds and reports the offending line", () => {
    const items = [labor(1_000), { kind: "discount", quantity: 1, unitPriceCents: 100 }];
    expectInvalid(() => computeQuoteTotals(items as unknown as PricedItem[]));
    try {
      computeQuoteTotals([labor(1_000), part(-5)]);
    } catch (error) {
      expect((error as DomainError).details).toEqual({ index: 1 });
    }
  });
});

describe("platformFeeCents", () => {
  it("is a provisional 10% of labor by default", () => {
    expect(PLATFORM_FEE_BPS).toBe(1000);
    expect(platformFeeCents(12_000)).toBe(1_200);
    expect(platformFeeCents(0)).toBe(0);
  });

  it("rounds half a cent up and anything less down", () => {
    expect(platformFeeCents(5)).toBe(1); // 0.5 -> 1
    expect(platformFeeCents(15)).toBe(2); // 1.5 -> 2
    expect(platformFeeCents(25)).toBe(3); // 2.5 -> 3 (half up, not half even)
    expect(platformFeeCents(14)).toBe(1); // 1.4 -> 1
    expect(platformFeeCents(4)).toBe(0); // 0.4 -> 0
    expect(platformFeeCents(12_345)).toBe(1_235); // 1234.5 -> 1235
    expect(platformFeeCents(333, 1500)).toBe(50); // 49.95 -> 50
  });

  it("rejects invalid labor and fee rates", () => {
    expectInvalid(() => platformFeeCents(-1));
    expectInvalid(() => platformFeeCents(10.5));
    expectInvalid(() => platformFeeCents(1_000, 3001));
    expectInvalid(() => platformFeeCents(1_000, 10.5));
  });

  it("agrees with the formula the bookings and invoices CHECK constraints use", () => {
    const sqlite = new Database(":memory:");
    try {
      // Same column types and CHECK expression as bookings/invoices in db/migrations/0001_init.sql.
      sqlite.exec(`CREATE TABLE fee_check (
        labor_cents INTEGER NOT NULL,
        platform_fee_bps INTEGER NOT NULL,
        platform_fee_cents INTEGER NOT NULL
          CHECK (platform_fee_cents = (labor_cents * platform_fee_bps + 5000) / 10000)
      ) STRICT`);
      const insert = sqlite.prepare<[number, number, number]>("INSERT INTO fee_check VALUES (?, ?, ?)");
      const laborValues = [
        ...Array.from({ length: 3_000 }, (_, i) => i),
        9_995, 9_999, 10_005, 123_455, 999_999, 1_000_000_000,
      ];
      sqlite.transaction(() => {
        for (const bps of [0, 1, 250, 999, 1000, 1500, 3000]) {
          for (const value of laborValues) {
            expect(() => insert.run(value, bps, platformFeeCents(value, bps)), `labor ${value} at ${bps} bps`).not.toThrow();
          }
        }
      })();
      // the CHECK is live: a fee one cent off is refused
      expect(() => insert.run(12_345, 1000, platformFeeCents(12_345) - 1)).toThrow(/CHECK constraint failed/);
    } finally {
      sqlite.close();
    }
  });
});

describe("computeBookingMoney", () => {
  it("includes the platform fee in the customer total and deducts it from the payout", () => {
    const totals = computeQuoteTotals([labor(20_000), part(8_000), { kind: "tax", quantity: 1, unitPriceCents: 660 }]);
    expect(computeBookingMoney(totals)).toEqual({
      ...totals,
      platformFeeBps: 1000,
      platformFeeCents: 2_000,
      mechanicPayoutCents: 28_660 - 2_000,
    });
  });

  it("accepts another fee rate", () => {
    const money = computeBookingMoney(computeQuoteTotals([labor(10_005)]), 500);
    expect(money.platformFeeCents).toBe(500); // 500.25 -> 500
    expect(money.mechanicPayoutCents).toBe(10_005 - 500);
  });

  it("rejects totals that do not add up", () => {
    const totals: QuoteTotals = { laborCents: 100, partsCents: 50, taxCents: 0, feeCents: 0, totalCents: 160 };
    expectInvalid(() => computeBookingMoney(totals), /does not equal/);
    expectInvalid(() => computeBookingMoney({ ...totals, partsCents: -10, totalCents: 90 }));
  });

  it("compares stored and recomputed totals field by field", () => {
    const a = computeQuoteTotals([labor(1_000), part(500)]);
    expect(sameQuoteTotals(a, { ...a })).toBe(true);
    expect(sameQuoteTotals(a, { ...a, partsCents: 400, laborCents: 1_100 })).toBe(false);
  });
});

describe("computeInvoiceTotals", () => {
  const quote = computeQuoteTotals([
    labor(15_000),
    part(6_000),
    { kind: "tax", quantity: 1, unitPriceCents: 495 },
    { kind: "fee", quantity: 1, unitPriceCents: 1_000 },
  ]);

  it("equals the booking money when no change order was approved", () => {
    expect(computeInvoiceTotals(quote, [])).toEqual({ ...computeBookingMoney(quote), approvedChangeOrderCount: 0 });
  });

  it("adds approved change orders and charges the fee on the combined labor", () => {
    const invoice = computeInvoiceTotals(quote, [
      { laborCents: 4_505, partsCents: 2_500, taxCents: 206 },
      { laborCents: 1_000, partsCents: 0, taxCents: 0 },
    ]);
    expect(invoice).toEqual({
      laborCents: 20_505,
      partsCents: 8_500,
      taxCents: 701,
      feeCents: 1_000,
      totalCents: 20_505 + 8_500 + 701 + 1_000,
      platformFeeBps: 1000,
      platformFeeCents: 2_051, // 2050.5 -> 2051
      mechanicPayoutCents: 20_505 + 8_500 + 701 + 1_000 - 2_051,
      approvedChangeOrderCount: 2,
    });
  });

  it("rejects invalid change order amounts", () => {
    expectInvalid(() => computeInvoiceTotals(quote, [{ laborCents: -1, partsCents: 0, taxCents: 0 }]));
    expectInvalid(() => computeInvoiceTotals(quote, [{ laborCents: 1.5, partsCents: 0, taxCents: 0 }]));
  });
});
