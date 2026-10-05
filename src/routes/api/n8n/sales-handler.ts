import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query, ID } from "node-appwrite";

const N8N_API_KEY = process.env.N8N_API_KEY;

export const Route = createFileRoute("/api/n8n/sales-handler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const providedKey = request.headers.get("x-api-key");
          if (N8N_API_KEY && providedKey !== N8N_API_KEY) {
            return Response.json({ error: "Unauthorized: Invalid x-api-key" }, { status: 401 });
          }

          const body = await request.json().catch(() => ({}));
          const { action, company_id, empresa_id, sale } = body;
          const activeCompanyId = company_id || empresa_id;

          if (!activeCompanyId || !action) {
            return Response.json(
              { error: "company_id and action are required" },
              { status: 400 },
            );
          }

          if (action === "create" || action === "criar-venda") {
            const payload = sale || body;
            const customerName = payload.cliente || payload.customer_name || "Cliente via n8n";
            const customerDoc = payload.cliente_documento || payload.doc || null;
            const customerPhone = payload.cliente_telefone || payload.phone || null;
            const customerEmail = payload.cliente_email || payload.email || null;
            const total = parseFloat(payload.valor_bruto || payload.total || "0");
            const paymentMethod = payload.payment_method || "outros";
            const notes = payload.observacoes || payload.notes || "Venda via n8n";

            // 1. Localizar ou criar cliente em partners
            let customerId = payload.cliente_id || payload.customer_id;
            if (!customerId && (customerDoc || customerPhone || customerName)) {
              const queries = [Query.equal("company_id", activeCompanyId), Query.limit(1)];
              if (customerDoc) queries.push(Query.equal("document", customerDoc));
              else if (customerPhone) queries.push(Query.equal("phone", customerPhone));

              const existingPartners = await serverDatabases.listDocuments(
                APPWRITE_DATABASE_ID,
                "partners",
                queries,
              );

              if (existingPartners.documents.length > 0) {
                customerId = existingPartners.documents[0].$id;
              } else {
                const newPartner = await serverDatabases.createDocument(
                  APPWRITE_DATABASE_ID,
                  "partners",
                  ID.unique(),
                  {
                    company_id: activeCompanyId,
                    name: customerName,
                    document: customerDoc,
                    phone: customerPhone,
                    email: customerEmail,
                    type: "customer",
                    active: true,
                  },
                );
                customerId = newPartner.$id;
              }
            }

            // 2. Criar a venda em sales
            const saleDoc = await serverDatabases.createDocument(
              APPWRITE_DATABASE_ID,
              "sales",
              ID.unique(),
              {
                company_id: activeCompanyId,
                customer_id: customerId,
                total: total,
                subtotal: total,
                discount: 0,
                status: "completed",
                payment_method: paymentMethod,
                notes: notes,
              },
            );

            // 3. Processar itens se fornecidos
            const items = payload.itens || payload.items || [];
            if (Array.isArray(items) && items.length > 0) {
              for (const item of items) {
                await serverDatabases.createDocument(
                  APPWRITE_DATABASE_ID,
                  "sale_items",
                  ID.unique(),
                  {
                    company_id: activeCompanyId,
                    sale_id: saleDoc.$id,
                    product_id: item.product_id || item.produto_id,
                    product_name: item.name || item.nome,
                    quantity: Number(item.quantity || item.quantidade || 1),
                    unit_price: Number(item.unit_price || item.preco || 0),
                    total_price: Number(item.total_price || item.total || 0),
                  },
                );

                // Movimentação de estoque
                if (item.product_id || item.produto_id) {
                  await serverDatabases.createDocument(
                    APPWRITE_DATABASE_ID,
                    "stock_movements",
                    ID.unique(),
                    {
                      company_id: activeCompanyId,
                      product_id: item.product_id || item.produto_id,
                      type: "OUT",
                      quantity: Number(item.quantity || item.quantidade || 1),
                      reason: `Venda ${saleDoc.$id} via n8n`,
                    },
                  );
                }
              }
            }

            // 4. Registrar recebível em payables
            await serverDatabases.createDocument(
              APPWRITE_DATABASE_ID,
              "payables",
              ID.unique(),
              {
                company_id: activeCompanyId,
                description: `Recebimento Venda ${saleDoc.$id}`,
                amount: total,
                direction: "RECEIVABLE",
                status: "PAID",
                payment_method: paymentMethod,
                due_date: new Date().toISOString(),
                paid_at: new Date().toISOString(),
              },
            );

            return Response.json({
              ok: true,
              sale_id: saleDoc.$id,
              customer_id: customerId,
              message: "Venda registrada com sucesso via n8n",
            });
          }

          return Response.json({ error: `Unsupported action: ${action}` }, { status: 400 });
        } catch (error: any) {
          console.error("n8n/sales-handler error:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },
  },
});
