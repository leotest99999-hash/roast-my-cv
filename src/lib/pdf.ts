import type { Output, Text } from "pdf2json";

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

async function ensurePdfJsNodePolyfills() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    const { default: DOMMatrix } = await import("@thednp/dommatrix");
    Object.assign(globalThis, { DOMMatrix });
  }

  if (typeof globalThis.ImageData === "undefined") {
    class ImageDataShim {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }

    Object.assign(globalThis, { ImageData: ImageDataShim });
  }

  if (typeof globalThis.Path2D === "undefined") {
    class Path2DShim {
      addPath() {}
    }

    Object.assign(globalThis, { Path2D: Path2DShim });
  }
}

async function extractTextWithPdfJsDist(uint8Array: Uint8Array) {
  await ensurePdfJsNodePolyfills();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, index) =>
      pdf
        .getPage(index + 1)
        .then((page) => page.getTextContent())
        .then((textContent) =>
          textContent.items
            .map((item) =>
              "str" in item && typeof item.str === "string" ? item.str : "",
            )
            .join(" "),
        ),
    ),
  );

  return pages.join("\n");
}

async function extractTextWithPdf2Json(arrayBuffer: ArrayBuffer) {
  const { default: PDFParser } = await import("pdf2json");
  const PDFParserWithRawText = PDFParser as unknown as new (
    context: null,
    needRawText: number,
  ) => InstanceType<typeof PDFParser>;
  const pdfParser = new PDFParserWithRawText(null, 1);
  const parsed = await new Promise<Output>((resolve, reject) => {
    pdfParser.on("pdfParser_dataReady", resolve);
    pdfParser.on("pdfParser_dataError", (err) =>
      reject(err instanceof Error ? err : err.parserError),
    );
    pdfParser.parseBuffer(Buffer.from(arrayBuffer));
  });

  return parsed.Pages.flatMap((page) =>
    page.Texts.map((textItem: Text) =>
      decodeURIComponent(textItem.R[0]?.T ?? ""),
    ),
  ).join(" ");
}

export async function extractPdfText(
  arrayBuffer: ArrayBuffer,
  options: ExtractPdfTextOptions = {},
) {
  const uint8Array = new Uint8Array(arrayBuffer.slice(0));

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
    let text = "";

    try {
      text = await extractTextWithPdfJsDist(uint8Array);
    } catch (pdfJsError) {
      const pdfJsDetails = getErrorDetails(pdfJsError);

      console.error("[pdf] pdfjs-dist extraction failed", {
        fileName: options.fileName ?? null,
        arrayBufferByteLength: arrayBuffer.byteLength,
        uint8ArrayLength: uint8Array.length,
        errorName: pdfJsDetails.name,
        errorMessage: pdfJsDetails.message,
        errorStack: pdfJsDetails.stack,
      });

      try {
        text = await extractTextWithPdf2Json(arrayBuffer);
      } catch (pdf2JsonError) {
        const pdf2JsonDetails = getErrorDetails(pdf2JsonError);

        console.error("[pdf] pdf2json extraction failed", {
          fileName: options.fileName ?? null,
          arrayBufferByteLength: arrayBuffer.byteLength,
          uint8ArrayLength: uint8Array.length,
          errorName: pdf2JsonDetails.name,
          errorMessage: pdf2JsonDetails.message,
          errorStack: pdf2JsonDetails.stack,
        });

        throw pdf2JsonError;
      }
    }

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
