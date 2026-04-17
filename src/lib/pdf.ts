import type { Output, Text } from "pdf2json";

const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const pdfHeaderSearchWindow = 1024;
const zipHeader = [0x50, 0x4b, 0x03, 0x04] as const;

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

function hasZipSignature(documentBytes: Uint8Array) {
  return zipHeader.every((byte, index) => documentBytes[index] === byte);
}

function getHexPreview(pdfBytes: Uint8Array, length = 24) {
  return Array.from(pdfBytes.subarray(0, Math.min(pdfBytes.length, length)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

type ExtractPdfTextOptions = {
  fileName?: string | null;
};

type ZipExtractionResult =
  | {
      kind: "embedded-pdf";
      entryNames: string[];
      text: string;
    }
  | {
      kind: "docx";
      entryNames: string[];
      text: string;
    }
  | {
      kind: "unknown-zip";
      entryNames: string[];
      text: null;
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

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTextFromDocxXml(xml: string) {
  const withBreaks = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<w:br\/>/g, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");

  return decodeXmlEntities(withoutTags)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractTextFromZipArchive(
  zipBytes: Uint8Array,
): Promise<ZipExtractionResult> {
  const { strFromU8, unzipSync } = await import("fflate");
  const entries = unzipSync(zipBytes);
  const entryNames = Object.keys(entries);
  const pdfEntry = entryNames.find((entryName) =>
    entryName.toLowerCase().endsWith(".pdf"),
  );

  if (pdfEntry) {
    const embeddedPdf = entries[pdfEntry];
    const embeddedBuffer = embeddedPdf.slice().buffer;

    return {
      kind: "embedded-pdf" as const,
      entryNames,
      text: await extractPdfText(embeddedBuffer, {
        fileName: pdfEntry,
      }),
    };
  }

  const documentXmlEntry = entryNames.find(
    (entryName) => entryName.toLowerCase() === "word/document.xml",
  );

  if (documentXmlEntry) {
    const docxText = extractTextFromDocxXml(strFromU8(entries[documentXmlEntry]));

    if (docxText) {
      return {
        kind: "docx" as const,
        entryNames,
        text: docxText,
      };
    }
  }

  return {
    kind: "unknown-zip" as const,
    entryNames,
    text: null,
  };
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
  const zipWrappedUpload = headerOffset < 0 && hasZipSignature(rawBytes);
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

  if (zipWrappedUpload) {
    try {
      const zipResult = await extractTextFromZipArchive(rawBytes);

      if (zipResult.text) {
        return zipResult.text;
      }

      console.error("[pdf] zip-wrapped upload did not contain a readable resume document", {
        fileName: options.fileName ?? null,
        arrayBufferByteLength: arrayBuffer.byteLength,
        entryNames: zipResult.entryNames.slice(0, 20),
        kind: zipResult.kind,
        headHex: getHexPreview(rawBytes),
      });
    } catch (zipError) {
      const zipDetails = getErrorDetails(zipError);

      console.error("[pdf] zip archive inspection failed", {
        fileName: options.fileName ?? null,
        arrayBufferByteLength: arrayBuffer.byteLength,
        headHex: getHexPreview(rawBytes),
        errorName: zipDetails.name,
        errorMessage: zipDetails.message,
        errorStack: zipDetails.stack,
      });
    }

    throw new PdfExtractionError(
      "That upload looks like a ZIP or Office document, not a real PDF. Please export the resume as an actual PDF and try again.",
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
