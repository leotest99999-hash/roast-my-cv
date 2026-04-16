declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = {
    text: string;
    [key: string]: unknown;
  };

  export default function pdfParse(data: Buffer): Promise<PdfParseResult>;
}
