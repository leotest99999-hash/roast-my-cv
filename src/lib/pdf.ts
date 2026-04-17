import type { Output, Text } from "pdf2json";

const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const pdfHeaderSearchWindow = 1024;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export function findPdfSignatureOffset(
  pdfInput: ArrayBuffer | Uint8Array,
  searchWindow: number = pdfHeaderSearchWindow,
) {
  const pdfBytes =
    pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput);
  const headerWindow = pdfBytes.subarray(
    0,
    Math.min(pdfBytes.length, searchWindow),
  );
  const maxOffset = headerWindow.length - pdfHeader.length;

  if (maxOffset < 0) {
    return -1;
  }

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const isHeaderMatch = pdfHeader.every(
      (byte, index) => headerWindow[offset + index] === byte,
    );

    if (isHeaderMatch) {
      return offset;
    }
  }

  return -1;
}

export function hasPdfSignature(pdfInput: ArrayBuffer | Uint8Array) {
  return findPdfSignatureOffset(pdfInput) >= 0;
}

function getHexPreview(pdfBytes: Uint8Array, length = 24) {
  return Array.from(pdfBytes.subarray(0, Math.min(pdfBytes.length, length)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

type ExtractPdfTextOptions = {
  fileName?: string | null;
};

type GlobalWithPdfJsWorker = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown;
  };
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

async function ensurePdfJsWorkerModule() {
  const globalWithPdfJsWorker = globalThis as GlobalWithPdfJsWorker;

  if (!globalWithPdfJsWorker.pdfjsWorker) {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    Object.assign(globalWithPdfJsWorker, { pdfjsWorker: workerModule });
  }
}

function decodePdf2JsonText(encodedText: string) {
  try {
    return decodeURIComponent(encodedText.replace(/\+/g, "%20"));
  } catch {
    return encodedText;
  }
}

async function extractTextWithPdfJsDist(uint8Array: Uint8Array) {
  await ensurePdfJsNodePolyfills();
  await ensurePdfJsWorkerModule();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  });
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
      decodePdf2JsonText(textItem.R[0]?.T ?? ""),
    ),
  ).join(" ");
}

export async function extractPdfText(
  arrayBuffer: ArrayBuffer,
  options: ExtractPdfTextOptions = {},
) {
  const rawBytes = new Uint8Array(arrayBuffer);
  const headerOffset = findPdfSignatureOffset(rawBytes);
  const headerOffsetAnywhere = findPdfSignatureOffset(rawBytes, rawBytes.length);
  const normalizedBytes =
    headerOffsetAnywhere >= 0
      ? rawBytes.slice(headerOffsetAnywhere)
      : Uint8Array.from(rawBytes);
  const pdfJsBytes = Uint8Array.from(normalizedBytes);
  const fallbackArrayBuffer = normalizedBytes.buffer.slice(0);

  if (!normalizedBytes.length) {
    throw new PdfExtractionError(
      "That upload looks empty. Please export the PDF again and retry.",
    );
  }

  const fileNameLooksLikePdf = options.fileName?.toLowerCase().endsWith(".pdf");

  if (headerOffset < 0 && !fileNameLooksLikePdf) {
    throw new PdfExtractionError(
      "That file doesn't look like a valid PDF. Please upload a PDF resume and try again.",
    );
  }

  try {
    let text = "";

    try {
      text = await extractTextWithPdfJsDist(pdfJsBytes);
    } catch (pdfJsError) {
      const pdfJsDetails = getErrorDetails(pdfJsError);

      console.error("[pdf] pdfjs-dist extraction failed", {
        fileName: options.fileName ?? null,
        arrayBufferByteLength: arrayBuffer.byteLength,
        uint8ArrayLength: normalizedBytes.length,
        headerOffset,
        headerOffsetAnywhere,
        headHex: getHexPreview(normalizedBytes),
        errorName: pdfJsDetails.name,
        errorMessage: pdfJsDetails.message,
        errorStack: pdfJsDetails.stack,
      });

      try {
        text = await extractTextWithPdf2Json(fallbackArrayBuffer);
      } catch (pdf2JsonError) {
        const pdf2JsonDetails = getErrorDetails(pdf2JsonError);

        console.error("[pdf] pdf2json extraction failed", {
          fileName: options.fileName ?? null,
          arrayBufferByteLength: arrayBuffer.byteLength,
          uint8ArrayLength: normalizedBytes.length,
          headerOffset,
          headerOffsetAnywhere,
          headHex: getHexPreview(normalizedBytes),
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
