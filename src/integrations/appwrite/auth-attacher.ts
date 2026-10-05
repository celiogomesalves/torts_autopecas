import { createMiddleware } from "@tanstack/react-start";
import { appwrite } from "./client";

export const attachAppwriteAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    return next();
  },
);
