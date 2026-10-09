import { createFileRoute } from "@tanstack/react-router";
import https from "node:https";

const supabaseHost = "oapfhdcvugcileuxumpb.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGZoZGN2dWdjaWxldXh1bXBiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5OTE0NCwiZXhwIjoyMDkyMzc1MTQ0fQ.XxOOAX5PlniPAEDY4CQS81kVy8ZxICdlwm8CS7oXPMU";

const appwriteEndpoint = process.env.VITE_APPWRITE_ENDPOINT
  ? new URL(process.env.VITE_APPWRITE_ENDPOINT).hostname
  : "appwrite.agenc-ia.net";
const projectId = process.env.VITE_APPWRITE_PROJECT_ID || "6ac12de100342a9e81f0";
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID || "6ac38b70003d7a7b6188";
const appwriteKey =
  process.env.APPWRITE_API_KEY ||
  "standard_eb44cd086d11c5640dde9b878bb8c6ac2fbb2130a08d55b52d03a226fc917e22bb17312b4f0fc8e1cf446a932131cb0542e3e7f33e138a679bcffaea297f64c397b2f5e0d41e89027a82d1208cf7d559a799b281fe715bff4856e2341dfb6746dee5363ac9a520def17bca8053576e9f94f842a7455104cfb5917170833389c4";

const targetTables = [
  "companies",
  "units",
  "categories",
  "brands",
  "stock_locations",
  "payment_methods",
  "products",
  "product_references",
  "partners",
  "memberships",
  "profiles",
  "cash_registers",
  "sales",
  "sale_items",
  "sale_payments",
  "cash_transactions",
  "payables",
  "stock_movements",
  "fiscal_notes",
  "fiscal_note_attempts",
  "delivery_orders",
];

function fetchSupabaseRows(table: string, offset = 0, limit = 1000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: supabaseHost,
        path: `/rest/v1/${table}?select=*`,
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Range-Unit": "items",
          Range: `${offset}-${offset + limit - 1}`,
        },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b || "[]"));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function appwriteReq(urlPath: string, method: string, data: any = null): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : "";
    const r = https.request(
      {
        hostname: appwriteEndpoint,
        path: "/v1" + urlPath,
        method: method,
        headers: {
          "X-Appwrite-Project": projectId,
          "X-Appwrite-Key": appwriteKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b || "{}") });
          } catch {
            resolve({ status: res.statusCode, body: b });
          }
        });
      },
    );
    r.on("error", reject);
    if (postData) r.write(postData);
    r.end();
  });
}

function prepareDocumentData(row: any, attrsMap: Map<string, any>) {
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!attrsMap.has(k)) continue;
    const attr = attrsMap.get(k);
    if (v === null || v === undefined) continue;

    if (attr.type === "boolean") {
      data[k] = Boolean(v);
    } else if (attr.type === "integer") {
      const parsed = parseInt(String(v), 10);
      if (!isNaN(parsed)) data[k] = parsed;
    } else if (attr.type === "double") {
      const parsed = parseFloat(String(v));
      if (!isNaN(parsed)) data[k] = parsed;
    } else if (attr.type === "string") {
      if (typeof v === "object") {
        data[k] = JSON.stringify(v);
      } else {
        const str = String(v);
        data[k] = str.length > attr.size ? str.substring(0, attr.size) : str;
      }
    } else {
      data[k] = v;
    }
  }
  return data;
}

async function syncTable(table: string) {
  const colRes = await appwriteReq(`/databases/${databaseId}/collections/${table}`, "GET");
  if (colRes.status !== 200) {
    return null;
  }
  const attrs = colRes.body.attributes || [];
  const attrsMap = new Map(attrs.map((a: any) => [a.key, a]));

  let allRows: any[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const chunk = await fetchSupabaseRows(table, offset, limit);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    allRows.push(...chunk);
    if (chunk.length < limit) break;
    offset += chunk.length;
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const concurrency = 6;
  for (let i = 0; i < allRows.length; i += concurrency) {
    const batch = allRows.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (row) => {
        const docId = row.id ? String(row.id) : null;
        if (!docId) return;

        const data = prepareDocumentData(row, attrsMap);

        const postRes = await appwriteReq(
          `/databases/${databaseId}/collections/${table}/documents`,
          "POST",
          {
            documentId: docId,
            data: data,
          },
        );

        if (postRes.status === 201) {
          created++;
        } else if (postRes.status === 409) {
          const patchRes = await appwriteReq(
            `/databases/${databaseId}/collections/${table}/documents/${docId}`,
            "PATCH",
            {
              data: data,
            },
          );
          if (patchRes.status === 200) {
            updated++;
          } else {
            unchanged++;
          }
        } else {
          unchanged++;
        }
      }),
    );
  }

  return {
    table,
    supabaseRows: allRows.length,
    created,
    updated,
    unchanged,
  };
}

export const Route = createFileRoute("/api/functions/sync-supabase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const tablesToSync =
            Array.isArray(body.tables) && body.tables.length > 0 ? body.tables : targetTables;

          const results = [];
          for (const table of tablesToSync) {
            try {
              const res = await syncTable(table);
              if (res) results.push(res);
            } catch (err: any) {
              results.push({ table, error: err.message });
            }
          }

          return Response.json({
            ok: true,
            syncedAt: new Date().toISOString(),
            results,
          });
        } catch (error: any) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
      },
    },
  },
});
