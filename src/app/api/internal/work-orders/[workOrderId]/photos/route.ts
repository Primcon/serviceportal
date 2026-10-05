import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { PhotoCategory, RecordVisibility } from "@prisma/client";
import { z } from "zod";
import { storeWorkOrderPhoto } from "@/features/work-orders/photo-upload";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/same-origin";
import { getActiveInternalUser } from "@/services/authorization";
import { maxPhotoBytes } from "@/services/photo-processing";

export const dynamic = "force-dynamic";

const fields = z.object({ photoCategory: z.nativeEnum(PhotoCategory), visibility: z.nativeEnum(RecordVisibility) });

function failure(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

/**
 * Adds one photo to a work order. The uploader sends photos one request at a time, a few in
 * parallel, so a large batch shows progress, survives one bad file, and never needs a huge request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ workOrderId: string }> }) {
  if (!isSameOriginRequest(request)) return failure(403, "This request didn't come from the portal.");
  const { workOrderId } = await params;
  try {
    const user = await getActiveInternalUser();
    // Refuse an oversized upload before reading it. The form fields add a little to the photo's size.
    if (Number(request.headers.get("content-length") ?? 0) > maxPhotoBytes + 1024 * 1024) return failure(413, `Photos must be ${maxPhotoBytes / (1024 * 1024)} MB or smaller.`);
    if (!z.string().uuid().safeParse(workOrderId).success) return failure(404, "Work order not found.");
    const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, equipmentId: true, serviceStageId: true } });
    if (!workOrder) return failure(404, "Work order not found.");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return failure(400, "Choose a photo to upload.");
    const input = fields.safeParse({ photoCategory: formData.get("photoCategory"), visibility: formData.get("visibility") ?? RecordVisibility.CUSTOMER_VISIBLE });
    if (!input.success) return failure(400, "Choose a category for the photo.");

    const photo = await storeWorkOrderPhoto({ workOrder, actorUserId: user.id, fileName: file.name, content: Buffer.from(await file.arrayBuffer()), ...input.data });
    revalidatePath(`/workspace/work-orders/${workOrder.id}`);
    revalidatePath(`/portal/work-orders/${workOrder.id}`);
    return NextResponse.json({ status: "success", id: photo.id });
  } catch (error) {
    if (error instanceof AccessDeniedError) return failure(403, error.message);
    if (error instanceof UserFacingError) return failure(400, error.message);
    console.error("Photo upload failed.", error);
    return failure(500, "The photo couldn't be saved. Try again.");
  }
}
