const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const pdfHeaderSearchWindow = 1024;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export function hasPdfSignature(pdfBuffer: Buffer | Uint8Array) {
  const headerWindow = pdfBuffer.subarray(
    0,
    Math.min(pdfBuffer.length, pdfHeaderSearchWindow),
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
  pdfBuffer: Buffer,
  options: ExtractPdfTextOptions = {},
) {
  if (!pdfBuffer.length) {
    throw new PdfExtractionError(
      "That upload looks empty. Please export the PDF again and retry.",
    );
  }

  const fileNameLooksLikePdf = options.fileName?.toLowerCase().endsWith(".pdf");

  if (!hasPdfSignature(pdfBuffer) && !fileNameLooksLikePdf) {
    throw new PdfExtractionError(
      "That file doesn't look like a valid PDF. Please upload a PDF resume and try again.",
    );
  }

  try {
    const { extractText } = await import("unpdf");
    const attemptExtraction = async (
      input: Buffer | Uint8Array,
      attempt: 1 | 2,
      description: string,
    ) => {
      try {
        return await extractText(input, {
          mergePages: true,
        });
      } catch (error) {
        const details = getErrorDetails(error);

        console.error(`[pdf] unpdf extraction attempt ${attempt} failed`, {
          attempt,
          description,
          fileName: options.fileName ?? null,
          bufferLength: input.length,
          errorName: details.name,
          errorMessage: details.message,
          errorStack: details.stack,
        });

        throw error;
      }
    };

    let result: Awaited<ReturnType<typeof extractText>>;

    try {
      result = await attemptExtraction(pdfBuffer, 1, "buffer");
    } catch (firstError) {
      const retryBuffer = Uint8Array.from(pdfBuffer);

      console.error("[pdf] retrying unpdf extraction with plain Uint8Array", {
        fileName: options.fileName ?? null,
        originalBufferLength: pdfBuffer.length,
        retryBufferLength: retryBuffer.length,
      });

      try {
        result = await attemptExtraction(
          retryBuffer,
          2,
          "plain-uint8array-retry",
        );
      } catch {
        throw firstError;
      }
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
