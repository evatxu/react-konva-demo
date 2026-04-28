import fs from "fs";
import path from "path";

import pg from "pg";

const { Pool } = pg;

const templateSeeds = [
  {
    code: "classic-racing-pro",
    name: "竞技旗舰版",
    permissionType: "free",
    description: "红白竞技主视觉，适合冠军海报、赛事快报和单羽高频出图。",
    coverUrl: null,
    status: "active",
    sortOrder: 10
  },
  {
    code: "public-loft-blueprint",
    name: "公棚荣耀版",
    permissionType: "paid",
    description: "蓝灰数据分栏布局，适合公棚公告、批量成绩展示与俱乐部统一交付。",
    coverUrl: null,
    status: "active",
    sortOrder: 20
  },
  {
    code: "crown-night-deluxe",
    name: "冠军典藏版",
    permissionType: "paid",
    description: "深色高对比版式，适合冠军归巢、年度典藏和品牌联名展示。",
    coverUrl: null,
    status: "active",
    sortOrder: 30
  }
];

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnv() {
  const cwd = process.cwd();
  loadDotEnvFile(path.join(cwd, ".env.local"));
  loadDotEnvFile(path.join(cwd, ".env"));
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required database env: ${name}`);
  }
  return value;
}

function createPool() {
  return new Pool({
    host: getRequiredEnv("DB_HOST"),
    port: Number(getRequiredEnv("DB_PORT")),
    database: getRequiredEnv("DB_NAME"),
    user: getRequiredEnv("DB_USER"),
    password: getRequiredEnv("DB_PASSWORD"),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000)
  });
}

async function ensureTemplate(client, template) {
  const existing = await client.query(
    `
      SELECT id
      FROM template_groups
      WHERE code = $1
      LIMIT 1
    `,
    [template.code]
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE template_groups
        SET
          name = $2,
          permission_type = $3,
          cover_url = $4,
          description = $5,
          status = $6,
          sort_order = $7,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        template.name,
        template.permissionType,
        template.coverUrl,
        template.description,
        template.status,
        template.sortOrder
      ]
    );
    return {
      mode: "updated",
      code: template.code
    };
  }

  await client.query(
    `
      INSERT INTO template_groups (
        code,
        name,
        permission_type,
        cover_url,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `,
    [
      template.code,
      template.name,
      template.permissionType,
      template.coverUrl,
      template.description,
      template.status,
      template.sortOrder
    ]
  );

  return {
    mode: "inserted",
    code: template.code
  };
}

async function main() {
  loadEnv();
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const results = [];
    for (const template of templateSeeds) {
      results.push(await ensureTemplate(client, template));
    }

    await client.query("COMMIT");

    console.log("Imported template seeds:");
    for (const result of results) {
      console.log(`- ${result.code}: ${result.mode}`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to import templates.");
  console.error(error);
  process.exit(1);
});
