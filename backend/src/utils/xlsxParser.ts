import XLSX from "xlsx";
import path from "path";
import fs from "fs/promises";

export async function parseXlsx(
  filePath: string
  // outDir: string
): Promise<{ jsonData: any[]; rowCount: number }> {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["Transcript - Raw"];
  if (!sheet) throw new Error('Sheet "Transcript - Raw" not found.');

  // figure out range
  const range = XLSX.utils.decode_range(sheet["!ref"]!);
  // read entire range with header row = first row
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    range: range,
  }) as any[][];

  // Compute header row and convert to Excel’s 1-based numbering
  const headerRowIndex = range.s.r;
  const headerRowExcelNumber = headerRowIndex + 1;

  const headers = raw.shift() as string[];

  // map rows to objects
  const jsonData = raw.map((row, i) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? null;
    });
    // Attach the original Excel row number
    obj.__row = headerRowExcelNumber + (i + 1);
    return obj;
  });

  const timestamp = Date.now();
  // const outFile = path.join(outDir, `transcript_${timestamp}.json`);
  // await fs.writeFile(outFile, JSON.stringify(jsonData, null, 2), "utf-8");

  return { jsonData, rowCount: jsonData.length };
}
