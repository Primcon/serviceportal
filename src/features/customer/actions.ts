"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/run-action";
import { getActiveCustomerUser } from "@/services/authorization";

export async function updateCustomerNotificationPreference(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const emailUpdates = z.boolean().parse(formData.get("emailUpdates") === "on");
    const user = await getActiveCustomerUser();
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: { emailUpdates },
      create: { userId: user.id, emailUpdates },
    });
    revalidatePath("/portal");
  });
}
