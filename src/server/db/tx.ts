import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import {
  sql,
  type Kysely,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
} from "kysely";

import { mapDbError } from "@/server/errors";
import type { DB } from "./schema.generated";

/** The Kysely handle passed to a `writeTx` callback; every query on it runs inside the transaction. */
export type Tx = Kysely<DB>;

// SQLite has one connection per Kysely instance, and writeTx holds it for the whole callback.
// A query sent through the root handle (ctx.db) from inside the callback would wait for that
// connection forever (on remote libSQL it would run outside the transaction, and a write would
// wait for the transaction's lock). Each instance built by createKysely / createLibsqlKysely
// carries a guard plugin with a token; writeTx marks its async context with the token so the
// guard can fail fast instead.
const guardTokens = new WeakMap<Kysely<DB>, object>();
const activeTransaction = new AsyncLocalStorage<object>();
const transactionHandles = new WeakSet<Kysely<DB>>();

const ROOT_HANDLE_IN_TX =
  "A query used the root database handle (ctx.db) inside writeTx(). It would wait forever for " +
  "the connection the transaction holds; run it through the `trx` passed to the callback.";
const NESTED_TX =
  "writeTx() does not nest. Pass the existing `trx` to helpers instead of opening another transaction.";

class TransactionGuardPlugin implements KyselyPlugin {
  readonly #token: object;

  constructor(token: object) {
    this.#token = token;
  }

  // Runs synchronously while the query is compiled, before a connection is requested.
  transformQuery({ node }: PluginTransformQueryArgs): RootOperationNode {
    if (activeTransaction.getStore() === this.#token) throw new Error(ROOT_HANDLE_IN_TX);
    return node;
  }

  async transformResult({ result }: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return result;
  }
}

/** Installs the misuse guard; used by `createKysely`. The returned instance is the one to share. */
export function withTransactionGuard(db: Kysely<DB>): Kysely<DB> {
  const token = {};
  const guarded = db.withPlugin(new TransactionGuardPlugin(token));
  guardTokens.set(guarded, token);
  return guarded;
}

async function rollbackQuietly(trx: Tx): Promise<void> {
  try {
    await sql`rollback`.execute(trx);
  } catch {
    // SQLite already rolled back (e.g. after SQLITE_FULL/IOERR); the original error matters.
  }
}

/**
 * Runs `fn` on one connection inside `BEGIN IMMEDIATE ... COMMIT` (on libSQL the dialect turns
 * these statements into a write transaction, see libsql.ts), so concurrent writers (other
 * requests, other processes) serialize instead of interleaving.
 * Rolls back when `fn` throws and rethrows through `mapDbError`: trigger and unique
 * violations arrive as DomainErrors, anything else unchanged. Returns `fn`'s result.
 *
 * Inside `fn`, use only `trx`: queries on `ctx.db` throw (see the guard above), and
 * `writeTx` cannot be nested.
 */
export async function writeTx<T>(db: Kysely<DB>, fn: (trx: Tx) => Promise<T>): Promise<T> {
  const token = guardTokens.get(db);
  if (transactionHandles.has(db) || (token && activeTransaction.getStore() === token)) {
    throw new Error(NESTED_TX);
  }

  return db.connection().execute(async (connection) => {
    // The guarded instance has exactly one plugin (the guard); the transaction handle drops it.
    const trx = token ? connection.withoutPlugins() : connection;
    transactionHandles.add(trx);

    const run = async (): Promise<T> => {
      try {
        await sql`begin immediate`.execute(trx);
      } catch (error) {
        throw mapDbError(error);
      }
      try {
        const result = await fn(trx);
        await sql`commit`.execute(trx);
        return result;
      } catch (error) {
        await rollbackQuietly(trx);
        throw mapDbError(error);
      }
    };

    try {
      return await (token ? activeTransaction.run(token, run) : run());
    } finally {
      transactionHandles.delete(trx);
    }
  });
}
