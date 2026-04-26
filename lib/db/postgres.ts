import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

const REQUIRED_ENV_KEYS = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;

declare global {
  // eslint-disable-next-line no-var
  var __POSTGRES_POOL__: Pool | undefined;
}

function getRequiredEnv(name: (typeof REQUIRED_ENV_KEYS)[number]) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required database env: ${name}`);
  }
  return value;
}

function getPoolConfig(): PoolConfig {
  const port = Number(getRequiredEnv("DB_PORT"));
  if (Number.isNaN(port)) {
    throw new Error("DB_PORT must be a valid number.");
  }

  return {
    host: getRequiredEnv("DB_HOST"),
    port,
    database: getRequiredEnv("DB_NAME"),
    user: getRequiredEnv("DB_USER"),
    password: getRequiredEnv("DB_PASSWORD"),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000)
  };
}

function createPool() {
  const pool = new Pool(getPoolConfig());

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
  });

  return pool;
}

export function getDb() {
  if (!globalThis.__POSTGRES_POOL__) {
    globalThis.__POSTGRES_POOL__ = createPool();
  }

  return globalThis.__POSTGRES_POOL__;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getDb().query<T>(text, params);
}

export async function withDbClient<T>(handler: (client: PoolClient) => Promise<T>) {
  const client = await getDb().connect();

  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>) {
  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function checkDatabaseConnection() {
  const result = await query<{ now: Date }>("SELECT NOW() AS now");
  return {
    connected: true,
    now: result.rows[0]?.now ?? null
  };
}
