import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";

export const Route = createFileRoute("/api/functions/send-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { user_id, title, message } = body;

          if (!user_id || !message) {
            return Response.json({ error: "user_id and message are required" }, { status: 400 });
          }

          // Busca subscriptions ativas do usuário
          const subs = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "push_subscriptions",
            [Query.equal("user_id", user_id)],
          );

          return Response.json({
            ok: true,
            subscriptions_found: subs.total,
            message: "Push processado",
          });
        } catch (error: any) {
          console.error("send-push error:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },
  },
});
