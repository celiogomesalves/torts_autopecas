import {
  Client,
  Account,
  Databases,
  Storage,
  Query,
  ID,
  type Models,
} from "appwrite";

export const APPWRITE_ENDPOINT =
  import.meta.env.VITE_APPWRITE_ENDPOINT || "https://appwrite.agenc-ia.net/v1";

export const APPWRITE_PROJECT_ID =
  import.meta.env.VITE_APPWRITE_PROJECT_ID || "6ac12de100342a9e81f0";

export const APPWRITE_DATABASE_ID =
  import.meta.env.VITE_APPWRITE_DATABASE_ID || "6ac38b70003d7a7b6188";

export const client = new Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

export { Query, ID };

// Helper para normalizar documentos retornados
export function normalizeDoc<T = any>(doc: any): T {
  if (!doc) return doc;
  const normalized: any = { ...doc };
  if (!normalized.id && doc.$id) normalized.id = doc.$id;
  if (!normalized.created_at && doc.$createdAt) normalized.created_at = doc.$createdAt;
  if (!normalized.updated_at && doc.$updatedAt) normalized.updated_at = doc.$updatedAt;
  return normalized as T;
}

// Adaptador de Query Fluente para Appwrite Databases
export class AppwriteQueryBuilder<T = any> {
  private collectionId: string;
  private queries: string[] = [];
  private isSingle = false;
  private isMaybeSingle = false;
  private pendingFilters: Array<(doc: any) => boolean> = [];

  constructor(collectionId: string) {
    this.collectionId = collectionId;
  }

  select(_columns = "*", _options?: any) {
    return this;
  }

  eq(column: string, value: any) {
    if (value === undefined || value === null) return this;
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.equal(targetCol, value));
    return this;
  }

  neq(column: string, value: any) {
    if (value === undefined || value === null) return this;
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.notEqual(targetCol, value));
    return this;
  }

  in(column: string, values: any[]) {
    if (!values || values.length === 0) return this;
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.equal(targetCol, values));
    return this;
  }

  gt(column: string, value: any) {
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.greaterThan(targetCol, value));
    return this;
  }

  gte(column: string, value: any) {
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.greaterThanEqual(targetCol, value));
    return this;
  }

  lt(column: string, value: any) {
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.lessThan(targetCol, value));
    return this;
  }

  lte(column: string, value: any) {
    const targetCol = column === "id" ? "$id" : column;
    this.queries.push(Query.lessThanEqual(targetCol, value));
    return this;
  }

  order(column: string, options: { ascending?: boolean } = { ascending: true }) {
    const targetCol =
      column === "id"
        ? "$id"
        : column === "created_at"
          ? "$createdAt"
          : column === "updated_at"
            ? "$updatedAt"
            : column;
    if (options.ascending) {
      this.queries.push(Query.orderAsc(targetCol));
    } else {
      this.queries.push(Query.orderDesc(targetCol));
    }
    return this;
  }

  limit(n: number) {
    this.queries.push(Query.limit(n));
    return this;
  }

  range(from: number, to: number) {
    const limit = Math.max(1, to - from + 1);
    this.queries.push(Query.offset(from));
    this.queries.push(Query.limit(limit));
    return this;
  }

  ilike(column: string, pattern: string) {
    const cleanPattern = pattern.replace(/%/g, "").trim();
    if (cleanPattern) {
      this.pendingFilters.push((doc: any) => {
        const val = String(doc[column] || "");
        return val.toLowerCase().includes(cleanPattern.toLowerCase());
      });
    }
    return this;
  }

  like(column: string, pattern: string) {
    return this.ilike(column, pattern);
  }

  single() {
    this.isSingle = true;
    this.queries.push(Query.limit(1));
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    this.queries.push(Query.limit(1));
    return this;
  }

  // Executa busca
  async then(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => any) | null,
    onrejected?: ((reason: any) => any) | null,
  ): Promise<any> {
    try {
      const res = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        this.collectionId,
        this.queries,
      );

      let docs = res.documents.map(normalizeDoc);
      if (this.pendingFilters.length > 0) {
        docs = docs.filter((doc) => this.pendingFilters.every((fn) => fn(doc)));
      }

      if (this.isSingle) {
        if (docs.length === 0) {
          const err = new Error("Registro não encontrado");
          return onfulfilled ? onfulfilled({ data: null, error: err }) : { data: null, error: err };
        }
        return onfulfilled ? onfulfilled({ data: docs[0], error: null }) : { data: docs[0], error: null };
      }

      if (this.isMaybeSingle) {
        return onfulfilled
          ? onfulfilled({ data: docs[0] ?? null, error: null })
          : { data: docs[0] ?? null, error: null };
      }

      return onfulfilled
        ? onfulfilled({ data: docs, error: null, count: res.total })
        : { data: docs, error: null, count: res.total };
    } catch (err: any) {
      const resp = { data: null, error: err, count: 0 };
      if (onrejected) return onrejected(err);
      return onfulfilled ? onfulfilled(resp) : resp;
    }
  }

  // Inserção
  async insert(recordOrRecords: any | any[]) {
    try {
      const records = Array.isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];
      const results: any[] = [];

      for (const raw of records) {
        const docId = raw.id || ID.unique();
        const data = { ...raw };
        delete data.$id;
        delete data.$createdAt;
        delete data.$updatedAt;
        delete data.$permissions;
        delete data.$databaseId;
        delete data.$collectionId;

        // Serializar objetos/arrays que não sejam strings
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && !(v instanceof Date)) {
            data[k] = JSON.stringify(v);
          }
        }

        const created = await databases.createDocument(
          APPWRITE_DATABASE_ID,
          this.collectionId,
          docId,
          data,
        );
        results.push(normalizeDoc(created));
      }

      return {
        data: Array.isArray(recordOrRecords) ? results : results[0],
        error: null,
      };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  // Atualização
  async update(patch: any) {
    const self = this;
    return {
      eq: async (col: string, val: any) => {
        try {
          const targetCol = col === "id" ? "$id" : col;
          let docId = val;

          if (targetCol !== "$id") {
            const list = await databases.listDocuments(APPWRITE_DATABASE_ID, self.collectionId, [
              Query.equal(targetCol, val),
              Query.limit(1),
            ]);
            if (list.documents.length === 0) {
              return { data: null, error: new Error("Documento não encontrado para atualização") };
            }
            docId = list.documents[0].$id;
          }

          const data = { ...patch };
          delete data.$id;
          delete data.id;
          delete data.$createdAt;
          delete data.$updatedAt;
          delete data.$permissions;

          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === "object" && !(v instanceof Date)) {
              data[k] = JSON.stringify(v);
            }
          }

          const updated = await databases.updateDocument(
            APPWRITE_DATABASE_ID,
            self.collectionId,
            docId,
            data,
          );
          return { data: normalizeDoc(updated), error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
    };
  }

  // Deleção
  async delete() {
    const self = this;
    return {
      eq: async (col: string, val: any) => {
        try {
          const targetCol = col === "id" ? "$id" : col;
          let docId = val;

          if (targetCol !== "$id") {
            const list = await databases.listDocuments(APPWRITE_DATABASE_ID, self.collectionId, [
              Query.equal(targetCol, val),
              Query.limit(1),
            ]);
            if (list.documents.length === 0) {
              return { data: null, error: null };
            }
            docId = list.documents[0].$id;
          }

          await databases.deleteDocument(APPWRITE_DATABASE_ID, self.collectionId, docId);
          return { data: true, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
    };
  }
}

// Adaptador de RPCs e funções de negócio
async function handleRpc(name: string, args: any = {}): Promise<{ data: any; error: any }> {
  try {
    let currentUser: any = null;
    try {
      currentUser = await account.get();
    } catch {
      // Sem usuario logado
    }

    switch (name) {
      case "is_super_admin": {
        if (!currentUser) return { data: false, error: null };
        const res = await databases.listDocuments(APPWRITE_DATABASE_ID, "user_roles", [
          Query.equal("user_id", currentUser.$id),
          Query.equal("role", "super_admin"),
          Query.limit(1),
        ]);
        return { data: res.total > 0, error: null };
      }

      case "has_company_role": {
        if (!currentUser) return { data: false, error: null };
        const res = await databases.listDocuments(APPWRITE_DATABASE_ID, "memberships", [
          Query.equal("user_id", currentUser.$id),
          Query.equal("company_id", args._company),
          Query.equal("role", args._role),
          Query.limit(1),
        ]);
        return { data: res.total > 0, error: null };
      }

      case "is_admin": {
        if (!currentUser) return { data: false, error: null };
        const res = await databases.listDocuments(APPWRITE_DATABASE_ID, "memberships", [
          Query.equal("user_id", currentUser.$id),
          Query.equal("company_id", args._company),
          Query.equal("role", ["owner", "admin"]),
          Query.limit(1),
        ]);
        return { data: res.total > 0, error: null };
      }

      case "has_permission": {
        if (!currentUser) return { data: false, error: null };
        const mRes = await databases.listDocuments(APPWRITE_DATABASE_ID, "memberships", [
          Query.equal("user_id", currentUser.$id),
          Query.equal("company_id", args._company),
          Query.limit(1),
        ]);
        if (mRes.total === 0) return { data: false, error: null };
        const member = mRes.documents[0];
        if (member.role === "owner" || member.role === "admin") return { data: true, error: null };

        const pRes = await databases.listDocuments(APPWRITE_DATABASE_ID, "role_permissions", [
          Query.equal("company_id", args._company),
          Query.equal("role", member.role),
          Query.equal("module", args._module),
          Query.equal("action", args._action),
          Query.limit(1),
        ]);
        return { data: pRes.total > 0, error: null };
      }

      case "get_app_base_url": {
        return { data: window.location.origin, error: null };
      }

      case "list_pending_companies": {
        const res = await databases.listDocuments(APPWRITE_DATABASE_ID, "companies", [
          Query.equal("status", "pending"),
        ]);
        return { data: res.documents.map(normalizeDoc), error: null };
      }

      case "approve_company": {
        await databases.updateDocument(APPWRITE_DATABASE_ID, "companies", args._company, {
          status: "active",
        });
        return { data: true, error: null };
      }

      case "reject_company": {
        await databases.updateDocument(APPWRITE_DATABASE_ID, "companies", args._company, {
          status: "rejected",
        });
        return { data: true, error: null };
      }

      case "clear_n8n_logs": {
        const logs = await databases.listDocuments(APPWRITE_DATABASE_ID, "n8n_chat_histories", [
          Query.limit(100),
        ]);
        for (const doc of logs.documents) {
          await databases.deleteDocument(APPWRITE_DATABASE_ID, "n8n_chat_histories", doc.$id);
        }
        return { data: true, error: null };
      }

      case "rotate_invite_code": {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        await databases.updateDocument(APPWRITE_DATABASE_ID, "companies", args._company, {
          invite_code: newCode,
        });
        return { data: newCode, error: null };
      }

      case "get_company_invite_code": {
        const comp = await databases.getDocument(APPWRITE_DATABASE_ID, "companies", args._company);
        return { data: comp.invite_code, error: null };
      }

      case "join_company_by_code": {
        if (!currentUser) return { data: null, error: new Error("Usuário não autenticado") };
        const list = await databases.listDocuments(APPWRITE_DATABASE_ID, "companies", [
          Query.equal("invite_code", args._code),
          Query.limit(1),
        ]);
        if (list.total === 0) return { data: null, error: new Error("Código de convite inválido") };
        const company = list.documents[0];
        const m = await databases.createDocument(
          APPWRITE_DATABASE_ID,
          "memberships",
          ID.unique(),
          {
            company_id: company.$id,
            user_id: currentUser.$id,
            role: "seller",
            status: "active",
          },
        );
        return { data: normalizeDoc(m), error: null };
      }

      case "reopen_sale": {
        const sale = await databases.updateDocument(APPWRITE_DATABASE_ID, "sales", args._sale, {
          status: "open",
        });
        return { data: normalizeDoc(sale), error: null };
      }

      case "cancel_sale": {
        const sale = await databases.updateDocument(APPWRITE_DATABASE_ID, "sales", args._sale_id, {
          status: "canceled",
          cancel_reason: args._reason || "",
        });
        return { data: normalizeDoc(sale), error: null };
      }

      case "delete_sale": {
        await databases.deleteDocument(APPWRITE_DATABASE_ID, "sales", args._sale_id);
        return { data: true, error: null };
      }

      case "finalize_sale_validated": {
        const sale = await databases.updateDocument(APPWRITE_DATABASE_ID, "sales", args._sale_id, {
          status: "completed",
        });
        return { data: normalizeDoc(sale), error: null };
      }

      case "list_companies_by_ip": {
        const list = await databases.listDocuments(APPWRITE_DATABASE_ID, "company_network_access", [
          Query.equal("ip", args._ip),
        ]);
        const companyIds = list.documents.map((d) => d.company_id);
        if (companyIds.length === 0) return { data: [], error: null };
        const companies = await databases.listDocuments(APPWRITE_DATABASE_ID, "companies", [
          Query.equal("$id", companyIds),
        ]);
        return { data: companies.documents.map(normalizeDoc), error: null };
      }

      case "register_network_access": {
        const doc = await databases.createDocument(
          APPWRITE_DATABASE_ID,
          "company_network_access",
          ID.unique(),
          {
            company_id: args._company_id,
            ip: args._ip,
            registered_by: currentUser?.$id,
          },
        );
        return { data: normalizeDoc(doc), error: null };
      }

      default:
        console.warn(`[Appwrite RPC fallback] Chamada para rpc não mapeada: ${name}`);
        return { data: null, error: null };
    }
  } catch (err: any) {
    return { data: null, error: err };
  }
}

const authListeners = new Set<(event: string, session: any) => void>();

function notifyAuthListeners(event: string, session: any) {
  authListeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch (e) {
      console.error("[Appwrite AuthListener Error]:", e);
    }
  });
}

// Adaptador de Autenticação
export const authAdapter = {
  signInWithPassword: async ({ email, password }: any) => {
    try {
      // Apagar sessao anterior se houver
      try {
        await account.deleteSession("current");
      } catch {
        // ignora se nao houver sessao
      }

      const session = await account.createEmailPasswordSession(email, password);
      let mappedUser: any = null;
      try {
        const user = await account.get();
        mappedUser = {
          ...user,
          id: user.$id,
          user_metadata: { name: user.name, full_name: user.name },
        };
      } catch {
        mappedUser = {
          id: (session as any).userId,
          $id: (session as any).userId,
          email: (session as any).providerUid || email,
          name: email.split("@")[0],
          user_metadata: { name: email.split("@")[0], full_name: email.split("@")[0] },
        };
      }

      const sessionObj = { ...session, user: mappedUser };
      notifyAuthListeners("SIGNED_IN", sessionObj);
      return { data: { session: sessionObj, user: mappedUser }, error: null };
    } catch (err: any) {
      return { data: { session: null, user: null }, error: err };
    }
  },

  signUp: async ({ email, password, options }: any) => {
    try {
      const name = options?.data?.name || email.split("@")[0];
      const user = await account.create(ID.unique(), email, password, name);
      // Criar sessao automatica
      let session = null;
      try {
        session = await account.createEmailPasswordSession(email, password);
      } catch {
        // Pode exigir confirmacao
      }

      // Criar perfil em profiles
      try {
        await databases.createDocument(APPWRITE_DATABASE_ID, "profiles", user.$id, {
          id: user.$id,
          name: name,
          email: email,
        });
      } catch (e) {
        console.warn("Nao foi possivel criar profile automaticamente:", e);
      }

      const mappedUser = {
        ...user,
        id: user.$id,
        user_metadata: { name: user.name, full_name: user.name },
      };
      const sessionObj = session ? { ...session, user: mappedUser } : null;
      if (sessionObj) notifyAuthListeners("SIGNED_IN", sessionObj);
      return { data: { user: mappedUser, session: sessionObj }, error: null };
    } catch (err: any) {
      return { data: { user: null, session: null }, error: err };
    }
  },

  signOut: async () => {
    try {
      await account.deleteSession("current");
      notifyAuthListeners("SIGNED_OUT", null);
      return { error: null };
    } catch (err: any) {
      notifyAuthListeners("SIGNED_OUT", null);
      return { error: err };
    }
  },

  getSession: async () => {
    try {
      const session = await account.getSession("current");
      let mappedUser: any = null;
      try {
        const user = await account.get();
        mappedUser = {
          ...user,
          id: user.$id,
          user_metadata: { name: user.name, full_name: user.name },
        };
      } catch {
        if (session) {
          mappedUser = {
            id: (session as any).userId,
            $id: (session as any).userId,
            email: (session as any).providerUid || "",
            name: ((session as any).providerUid || "").split("@")[0],
            user_metadata: { name: ((session as any).providerUid || "").split("@")[0] },
          };
        }
      }
      return { data: { session: { ...session, user: mappedUser } }, error: null };
    } catch (err: any) {
      return { data: { session: null }, error: null };
    }
  },

  getUser: async () => {
    try {
      const user = await account.get();
      const mappedUser = {
        ...user,
        id: user.$id,
        user_metadata: { name: user.name, full_name: user.name },
      };
      return { data: { user: mappedUser }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: null };
    }
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    authListeners.add(callback);

    // Inicializa verificando sessao
    account
      .get()
      .then((user) => {
        const mappedUser = {
          ...user,
          id: user.$id,
          user_metadata: { name: user.name, full_name: user.name },
        };
        callback("SIGNED_IN", { user: mappedUser, $id: user.$id });
      })
      .catch(() => {
        callback("SIGNED_OUT", null);
      });

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authListeners.delete(callback);
          },
        },
      },
    };
  },
};

// Cliente Principal
export const appwrite = {
  from: <T = any>(table: string) => new AppwriteQueryBuilder<T>(table),
  rpc: handleRpc,
  auth: authAdapter,
  storage: {
    from: (_bucket: string) => ({
      upload: async (_path: string, _file: any) => ({ data: null, error: null }),
      getPublicUrl: (filePath: string) => ({
        data: { publicUrl: filePath },
      }),
    }),
  },
  functions: {
    invoke: async (name: string, options: any = {}) => {
      try {
        const res = await fetch(`/api/functions/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body || {}),
        });
        const data = await res.json();
        return { data, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    },
  },
  channel: (name: string) => {
    let subUnsubscribe: (() => void) | null = null;
    const channelObj = {
      name,
      on: (_type: string, filter: any, callback: (payload: any) => void) => {
        try {
          const col = filter?.table || "delivery_orders";
          const channelName = `databases.${APPWRITE_DATABASE_ID}.collections.${col}.documents`;
          subUnsubscribe = client.subscribe([channelName], (response: any) => {
            const event = response.events?.[0] || "";
            let eventType = "UPDATE";
            if (event.includes(".create")) eventType = "INSERT";
            else if (event.includes(".delete")) eventType = "DELETE";

            callback({
              eventType,
              new: response.payload,
              old: response.payload,
            });
          });
        } catch {
          // Ignora se websocket realtime nao puder conectar
        }
        return channelObj;
      },
      subscribe: () => channelObj,
      unsubscribe: () => {
        if (typeof subUnsubscribe === "function") {
          subUnsubscribe();
          subUnsubscribe = null;
        }
      },
    };
    return channelObj;
  },
  removeChannel: (channelObj: any) => {
    if (channelObj && typeof channelObj.unsubscribe === "function") {
      channelObj.unsubscribe();
    }
  },
};

// Alias exportado para facil transicao
export const db = appwrite;
export const appwriteDb = appwrite;
