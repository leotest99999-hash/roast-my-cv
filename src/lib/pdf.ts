import { PDFParse } from "pdf-parse";

export async function extractPdfText(pdfBuffer: Buffer) {
  const parser = new PDFParse({
    data: new Uint8Array(pdfBuffer),
  });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
