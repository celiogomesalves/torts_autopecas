import { createFileRoute } from "@tanstack/react-router";

function appRedirect(origin: string, status: "ok" | "error", message?: string) {
  const u = new URL("/app/configuracoes", origin);
  u.searchParams.set("tab", "drive");
  u.searchParams.set("drive_status", status);
  if (message) u.searchParams.set("drive_message", message.slice(0, 200));
  return u.toString();
}

export const Route = createFileRoute("/api/public/google-drive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const redirectFinal = (status: "ok" | "error", message?: string) =>
          Response.redirect(appRedirect(url.origin, status, message), 302);

        if (error) return redirectFinal("error", `Google: ${error}`);
        if (!code || !state) return redirectFinal("error", "Parâmetros ausentes");

        const {
          verifyState,
          exchangeCodeForTokens,
          fetchUserEmail,
          ensureFolder,
        } = await import("@/lib/google-drive.server");
        const { getDriveSupabaseAdmin } = await import("@/lib/drive-supabase.server");
        const supabaseAdmin = getDriveSupabaseAdmin();

        const verified = await verifyState(state);
        if (!verified) return redirectFinal("error", "State inválido ou expirado");

        try {
          const redirectUri = `${url.origin}/api/public/google-drive/callback`;
          const tokens = await exchangeCodeForTokens({ code, redirectUri });
          if (!tokens.refresh_token) {
            return redirectFinal(
              "error",
              "Google não retornou refresh_token. Desconecte o app na conta Google e tente novamente.",
            );
          }
          const email = await fetchUserEmail(tokens.access_token);

          // Garante pasta-raiz
          const { data: existing } = await supabaseAdmin
            .from("company_drive_settings")
            .select("root_folder_name")
            .eq("company_id", verified.companyId)
            .maybeSingle();
          const folderName = existing?.root_folder_name || "Notas Fiscais";
          const rootFolderId = await ensureFolder({
            accessToken: tokens.access_token,
            parentId: null,
            name: folderName,
          });

          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          const { error: upErr } = await supabaseAdmin
            .from("company_drive_settings")
            .upsert(
              {
                company_id: verified.companyId,
                enabled: true,
                google_email: email,
                refresh_token: tokens.refresh_token,
                access_token: tokens.access_token,
                token_expires_at: expiresAt,
                root_folder_id: rootFolderId,
                root_folder_name: folderName,
                connected_at: new Date().toISOString(),
              },
              { onConflict: "company_id" },
            );
          if (upErr) throw new Error(upErr.message);

          return redirectFinal("ok", `Conectado como ${email ?? "conta Google"}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[google-drive callback]", msg);
          return redirectFinal("error", msg);
        }
      },
    },
  },
});
