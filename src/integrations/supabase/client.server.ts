import { serverDatabases, APPWRITE_DATABASE_ID } from "../appwrite/client.server";
import { appwrite } from "../appwrite/adapter";

export * from "../appwrite/client.server";

// Emulador de supabaseAdmin no servidor para Appwrite
export const supabaseAdmin = {
  ...appwrite,
  from: (table: string) => appwrite.from(table),
  databases: serverDatabases,
  databaseId: APPWRITE_DATABASE_ID,
};

export default supabaseAdmin;
