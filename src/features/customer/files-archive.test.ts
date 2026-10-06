import { describe, expect, it } from "vitest";
import { archivePaths } from "./files-archive";

describe("archivePaths", () => {
  it("files documents and photos into folders, numbering names that repeat", () => {
    expect(archivePaths([
      { id: "1", kind: "DOCUMENT", fileName: "Final report.pdf", photoCategory: null, documentType: "FINAL_SERVICE_REPORT" },
      { id: "2", kind: "DOCUMENT", fileName: "final report.pdf", photoCategory: null, documentType: "OTHER" },
      { id: "3", kind: "PHOTO", fileName: "IMG_0412.JPG", photoCategory: "IDENTIFICATION", documentType: null },
      { id: "4", kind: "PHOTO", fileName: "IMG_0412.heic", photoCategory: "IDENTIFICATION", documentType: null },
      { id: "5", kind: "PHOTO", fileName: "IMG_0412.JPG", photoCategory: "TESTING", documentType: null },
    ]).map((entry) => entry.path)).toEqual([
      "Documents/Final report.pdf",
      "Documents/final report (2).pdf",
      "Photos/Identification/IMG_0412.webp",
      "Photos/Identification/IMG_0412 (2).webp",
      "Photos/Testing/IMG_0412.webp",
    ]);
  });

  it("makes awkward names safe to save", () => {
    const [entry] = archivePaths([{ id: "1", kind: "DOCUMENT", fileName: '..\\..\\quote: "rev 2"?.pdf', photoCategory: null, documentType: "REPAIR_QUOTE" }]);
    // No path separators survive, so a file can't be written outside its folder.
    expect(entry.path).toBe("Documents/-..-quote- -rev 2--.pdf");
    expect(archivePaths([{ id: "1", kind: "PHOTO", fileName: "../../etc/passwd", photoCategory: "ARRIVAL", documentType: null }])[0].path).toBe("Photos/Arrival/-..-etc-passwd.webp");
    expect(archivePaths([{ id: "1", kind: "DOCUMENT", fileName: "   ", photoCategory: null, documentType: null }])[0].path).toBe("Documents/file");
  });
});
