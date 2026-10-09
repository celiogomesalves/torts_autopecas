import { createServerFn } from "@tanstack/react-start";
import { createSign } from "crypto";

// Assina o payload (toString) do QZ Tray usando SHA512withRSA e devolve
// a assinatura em base64, como o QZ espera.
export const signQzRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { toSign: string }) => data)
  .handler(async ({ data }) => {
    const pk = process.env.QZ_PRIVATE_KEY;
    if (!pk) throw new Error("QZ_PRIVATE_KEY não configurada no servidor.");
    const signer = createSign("RSA-SHA512");
    signer.update(data.toSign);
    signer.end();
    const signature = signer.sign(pk).toString("base64");
    return { signature };
  });
