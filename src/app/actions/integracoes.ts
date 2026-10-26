"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/access";
import { syncChServer } from "@/lib/chserver-sync";
import type { ActionState } from "@/lib/form";

export async function runChServerSync(_prev: ActionState): Promise<ActionState> {
  const admin = await requireAdmin();
  const r = await syncChServer({ id: admin.id, name: admin.name });
  revalidatePath("/", "layout");
  return r.ok ? { ok: r.message } : { error: r.message };
}
