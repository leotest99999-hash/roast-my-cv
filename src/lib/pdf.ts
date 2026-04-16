const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const pdfHeaderSearchWindow = 1024;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export function hasPdfSignature(pdfInput: ArrayBuffer | Uint8Array) {
  const pdfBytes =
    pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput);
  const headerWindow = pdfBytes.subarray(
    0,
    Math.min(pdfBytes.length, pdfHeaderSearchWindow),
  );
  const maxOffset = headerWindow.length - pdfHeader.length;

  if (maxOffset < 0) {
    return false;
  }

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const isHeaderMatch = pdfHeader.every(
      (byte, index) => headerWindow[offset + index] === byte,
    );

    if (isHeaderMatch) {
      return true;
    }
  }

  return false;
}

type ExtractPdfTextOptions = {
  fileName?: string | null;
};

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown error",
    stack: undefined,
    name: typeof error,
  };
}

export async function extractPdfText(
  arrayBuffer: ArrayBuffer,
  options: ExtractPdfTextOptions = {},
) {
  const uint8Array = new Uint8Array(arrayBuffer);

  if (!uint8Array.length) {
    throw new PdfExtractionError(
      "That upload looks empty. Please export the PDF again and retry.",
    );
  }

  const fileNameLooksLikePdf = options.fileName?.toLowerCase().endsWith(".pdf");

  if (!hasPdfSignature(uint8Array) && !fileNameLooksLikePdf) {
    throw new PdfExtractionError(
      "That file doesn't look like a valid PDF. Please upload a PDF resume and try again.",
    );
  }

  try {
    const { extractText } = await import("unpdf");
    let result: Awaited<ReturnType<typeof extractText>>;

    try {
      result = await extractText(uint8Array, {
        mergePages: true,
      });
    } catch (error) {
      const details = getErrorDetails(error);

      console.error("[pdf] unpdf extraction failed", {
        fileName: options.fileName ?? null,
        arrayBufferByteLength: arrayBuffer.byteLength,
        uint8ArrayLength: uint8Array.length,
        errorName: details.name,
        errorMessage: details.message,
        errorStack: details.stack,
      });

      throw error;
    }

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
