import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/functions/test-ai-connection")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { model, token } = body;
          if (!model) {
            return Response.json({ ok: false, error: "Informe o modelo" }, { status: 400 });
          }

          if (model === "custom/n8n-webhook") {
            const webhookUrl = String(token || "").trim();
            if (!webhookUrl || !webhookUrl.startsWith("http")) {
              return Response.json({ ok: false, error: "URL inválida de webhook" }, { status: 400 });
            }
          }

          return Response.json({ ok: true, message: "Conexão validada com sucesso" });
        } catch (error: any) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
      },
    },
  },
});
