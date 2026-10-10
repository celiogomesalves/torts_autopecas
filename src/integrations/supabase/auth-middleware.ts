import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "./client.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();

    let token = "";
    if (request?.headers) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "").trim();
      }
    }

    // Se o token contiver payload JWT com sub, extrai o identificador do usuário
    let userId = token || "appwrite-user";
    if (token && token.includes(".")) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
          if (payload.sub || payload.userId || payload.user_id) {
            userId = payload.sub || payload.userId || payload.user_id;
          }
        }
      } catch {
        // ignora
      }
    }

    return next({
      context: {
        supabase: supabaseAdmin as any,
        userId,
        claims: { sub: userId },
      },
    });
  },
);
