const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const pdfHeaderSearchWindow = 1024;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export function hasPdfSignature(pdfBuffer: Buffer | Uint8Array) {
  const maxOffset = Math.min(
    pdfBuffer.length - pdfHeader.length,
    pdfHeaderSearchWindow - pdfHeader.length,
  );

  if (maxOffset < 0) {
    return false;
  }

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const isHeaderMatch = pdfHeader.every(
      (byte, index) => pdfBuffer[offset + index] === byte,
    );

    if (isHeaderMatch) {
      return true;
    }
  }

  return false;
}

export async function extractPdfText(pdfBuffer: Buffer) {
  if (!pdfBuffer.length) {
    throw new PdfExtractionError(
      "That upload looks empty. Please export the PDF again and retry.",
    );
  }

  if (!hasPdfSignature(pdfBuffer)) {
    throw new PdfExtractionError(
      "That file doesn't look like a valid PDF. Please upload a PDF resume and try again.",
    );
  }

  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(pdfBuffer), {
      mergePages: true,
    });
    const text = typeof result?.text === "string" ? result.text : "";

    if (!text.trim()) {
      throw new PdfExtractionError(
        "We couldn't read the text in that PDF. Try a text-based export instead of an image-only scan.",
      );
    }

    return text;
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw error;
    }

    throw new PdfExtractionError(
      "We couldn't read that PDF just now. Please export it again and retry.",
    );
  }
}
