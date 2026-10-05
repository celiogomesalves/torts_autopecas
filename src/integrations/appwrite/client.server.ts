import { Client, Databases, Users, Storage } from "node-appwrite";
import { appwriteDb } from "./adapter";

export const APPWRITE_ENDPOINT =
  process.env.APPWRITE_ENDPOINT ||
  process.env.VITE_APPWRITE_ENDPOINT ||
  "https://appwrite.agenc-ia.net/v1";

export const APPWRITE_PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  "6ac12de100342a9e81f0";

export const APPWRITE_DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID ||
  process.env.VITE_APPWRITE_DATABASE_ID ||
  "6ac38b70003d7a7b6188";

export const APPWRITE_API_KEY =
  process.env.APPWRITE_API_KEY ||
  "standard_eb44cd086d11c5640dde9b878bb8c6ac2fbb2130a08d55b52d03a226fc917e22bb17312b4f0fc8e1cf446a932131cb0542e3e7f33e138a679bcffaea297f64c397b2f5e0d41e89027a82d1208cf7d559a799b281fe715bff4856e2341dfb6746dee5363ac9a520def17bca8053576e9f94f842a7455104cfb5917170833389c4";

const serverClient = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

export const serverDatabases = new Databases(serverClient);
export const serverUsers = new Users(serverClient);
export const serverStorage = new Storage(serverClient);

export const appwriteAdmin = {
  ...appwriteDb,
  client: serverClient,
  databases: serverDatabases,
  users: serverUsers,
  storage: serverStorage,
};
