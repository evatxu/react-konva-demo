import { jsonSuccess, withServiceError } from "@/lib/api/http";
import { query } from "@/lib/db/postgres";
import type { ProductOption } from "@/lib/pigeon-studio";

export const runtime = "nodejs";

type ProductRow = {
  code: string;
  name: string;
  product_type: "times_card" | "monthly";
  price_cents: number;
  times_count: number | null;
  duration_days: number | null;
};

function formatPriceLabel(priceCents: number) {
  const amount = priceCents / 100;
  return Number.isInteger(amount) ? `¥${amount}` : `¥${amount.toFixed(2)}`;
}

function buildDescription(row: ProductRow) {
  if (row.product_type === "times_card") {
    return `不限制过期时间，可导出 ${row.times_count ?? 0} 条成功记录，可用全部模板。`;
  }

  return `${row.duration_days ?? 0} 天内不限导出张数，可用全部模板且无水印。`;
}

function mapProductRow(row: ProductRow): ProductOption {
  return {
    id: row.code,
    name: row.name,
    description: buildDescription(row),
    priceLabel: formatPriceLabel(row.price_cents),
    kind: row.product_type === "times_card" ? "pack" : "monthly",
    credits: row.times_count ?? undefined,
    days: row.duration_days ?? undefined
  };
}

export async function GET() {
  try {
    const result = await query<ProductRow>(
      `
        SELECT
          code,
          name,
          product_type,
          price_cents,
          times_count,
          duration_days
        FROM products
        WHERE status = $1
        ORDER BY sort_order ASC, id ASC
      `,
      ["active"]
    );

    return jsonSuccess(result.rows.map(mapProductRow));
  } catch (error) {
    return withServiceError(error);
  }
}
