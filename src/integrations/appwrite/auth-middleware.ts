import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { appwriteAdmin } from "./client.server";

export const requireAppwriteAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    return next({
      context: {
        appwrite: appwriteAdmin,
      },
    });
  },
);
