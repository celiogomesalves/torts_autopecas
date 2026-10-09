import { createFileRoute } from "@tanstack/react-router";

function appRedirect(origin: string, status: "ok" | "error", message?: string) {
  const u = new URL("/app/relatorios", origin);
  u.searchParams.set("tab", "contabilidade");
  u.searchParams.set("email_status", status);
  if (message) u.searchParams.set("email_message", message.slice(0, 200));
  return u.toString();
}

export const Route = createFileRoute("/api/public/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const done = (status: "ok" | "error", message?: string) =>
          Response.redirect(appRedirect(url.origin, status, message), 302);

        if (error) return done("error", `Google: ${error}`);
        if (!code || !state) return done("error", "Parâmetros ausentes");

        const { verifyGmailState, exchangeGmailCode, fetchGoogleEmail, getEmailAdmin } =
          await import("@/lib/gmail.server");

        const verified = await verifyGmailState(state);
        if (!verified) return done("error", "State inválido ou expirado");

        try {
          // Always use the canonical custom-domain redirect URI so it matches
          // what was sent to Google in the auth URL (only localhost dev varies).
          const redirectUri =
            url.hostname === "localhost"
              ? `${url.origin}/api/public/gmail/callback`
              : `https://tortsautopecas.agenc-ia.net/api/public/gmail/callback`;
          const tokens = await exchangeGmailCode({ code, redirectUri });
          if (!tokens.refresh_token) {
            return done(
              "error",
              "Google não retornou refresh_token. Remova o acesso do app na conta Google e conecte novamente.",
            );
          }
          const email = await fetchGoogleEmail(tokens.access_token);
          const admin = await getEmailAdmin();
          const { error: upErr } = await admin.from("company_email_settings").upsert(
            {
              company_id: verified.companyId,
              provider: "gmail",
              google_email: email,
              refresh_token: tokens.refresh_token,
              access_token: tokens.access_token,
              token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id" },
          );
          if (upErr) throw new Error(upErr.message);
          return done("ok", `Conectado como ${email ?? "conta Google"}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[gmail callback]", msg);
          return done("error", msg);
        }
      },
    },
  },
});
