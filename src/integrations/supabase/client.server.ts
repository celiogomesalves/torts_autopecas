import { serverDatabases, APPWRITE_DATABASE_ID } from "../appwrite/client.server";
import { appwrite, AppwriteQueryBuilder } from "../appwrite/adapter";

export * from "../appwrite/client.server";

// Emulador de supabaseAdmin no servidor para Appwrite com privilégios de API Key administrativa
export const supabaseAdmin = {
  ...appwrite,
  from: (table: string) => new AppwriteQueryBuilder(table, serverDatabases),
  databases: serverDatabases,
  databaseId: APPWRITE_DATABASE_ID,
};

export default supabaseAdmin;
