export async function extractPdfText(pdfBuffer: Buffer) {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(pdfBuffer), {
    mergePages: true,
  });

  return text;
}
