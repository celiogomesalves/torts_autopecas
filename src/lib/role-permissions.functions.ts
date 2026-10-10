import { createServerFn } from "@tanstack/react-start";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query, ID, Permission, Role } from "node-appwrite";

export interface SaveRolePermissionInput {
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export const saveRolePermissionsBatchFn = createServerFn({ method: "POST" })
  .inputValidator((input: { permissions: SaveRolePermissionInput[] }) => input)
  .handler(async ({ data }) => {
    const { permissions } = data;
    if (!permissions || !permissions.length) {
      return { success: true, count: 0 };
    }

    const defaultPermissions = [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
      Permission.read(Role.guests()),
    ];

    for (const item of permissions) {
      const { role_id, module, can_view, can_create, can_edit, can_delete } = item;

      // 1. Encontrar todos os documentos existentes para (role_id, module)
      let existingDocs: any[] = [];
      try {
        const list = await serverDatabases.listDocuments(
          APPWRITE_DATABASE_ID,
          "role_permissions",
          [
            Query.equal("role_id", role_id),
            Query.equal("module", module),
            Query.limit(10),
          ]
        );
        existingDocs = list.documents;
      } catch (err) {
        console.warn(`[saveRolePermissionsBatchFn] Erro ao buscar permissão para ${role_id}/${module}:`, err);
      }

      const payload = {
        role_id,
        module,
        can_view: Boolean(can_view),
        can_create: Boolean(can_create),
        can_edit: Boolean(can_edit),
        can_delete: Boolean(can_delete),
        updated_at: new Date().toISOString(),
      };

      if (existingDocs.length > 0) {
        // Atualiza o primeiro documento com permissões completas
        const primaryDoc = existingDocs[0];
        try {
          await serverDatabases.updateDocument(
            APPWRITE_DATABASE_ID,
            "role_permissions",
            primaryDoc.$id,
            payload,
            defaultPermissions
          );
        } catch (updateErr) {
          console.error(`[saveRolePermissionsBatchFn] Erro ao atualizar documento ${primaryDoc.$id}:`, updateErr);
          throw updateErr;
        }

        // Deleta os eventuais duplicados para manter a unicidade
        if (existingDocs.length > 1) {
          for (let i = 1; i < existingDocs.length; i++) {
            const dup = existingDocs[i];
            try {
              await serverDatabases.deleteDocument(
                APPWRITE_DATABASE_ID,
                "role_permissions",
                dup.$id
              );
            } catch (delErr) {
              console.warn(`[saveRolePermissionsBatchFn] Erro ao remover duplicata ${dup.$id}:`, delErr);
            }
          }
        }
      } else {
        // Cria documento novo
        try {
          await serverDatabases.createDocument(
            APPWRITE_DATABASE_ID,
            "role_permissions",
            ID.unique(),
            {
              ...payload,
              id: ID.unique(),
              created_at: new Date().toISOString(),
            },
            defaultPermissions
          );
        } catch (createErr) {
          console.error(`[saveRolePermissionsBatchFn] Erro ao criar documento ${role_id}/${module}:`, createErr);
          throw createErr;
        }
      }
    }

    return { success: true, count: permissions.length };
  });
