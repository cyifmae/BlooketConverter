import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";
import parseXML from "./envelope/parseXML.js";

class schoologyToBlooketHandler implements FormatHandler {

  public name = "Schoology → Blooket";
  public ready = true;

  public supportedFormats: FileFormat[] = [
    CommonFormats.SCHOOLOGY.supported("schoology", true, false),
    CommonFormats.BLOOKET.supported("blooket", false, true)
  ];

  async init() {
    this.ready = true;
  }

  // Escape CSV fields safely
  private csvEscape(str: string): string {
    if (str == null) return "";
    str = String(str);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  }

  // Extract plain text from Schoology XML <TEXT> nodes
  private extractText(node: any): string {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(x => this.extractText(x)).join(" ");

    if (typeof node === "object") {
      if ("_text" in node) return node._text;
      if ("TEXT" in node) return this.extractText(node.TEXT);
      if ("_children" in node) {
        return node._children.map((c: any) => this.extractText(c)).join(" ");
      }
    }
    return "";
  }
private buildBlooketCSV(questions: any[]): string {
  // Blooket header
  let csv =
    `"Blooket\nImport Template",,,,,,,\n` +
    `Question #,Question Text,Answer 1,Answer 2,"Answer 3\n(Optional)","Answer 4\n(Optional)","Time Limit (sec)\n(Max: 300 seconds)","Correct Answer(s)\n(Only include Answer #)"\n`;

  questions.forEach((q, index) => {
    const rowNum = index + 1;

    const a1 = q.answers[0]?.text ?? "";
    const a2 = q.answers[1]?.text ?? "";
    const a3 = q.answers[2]?.text ?? "";
    const a4 = q.answers[3]?.text ?? "";

    const correctIndexes = q.answers
      .map((a: any, i: number) => (a.id === q.correct ? (i + 1) : null))
      .filter(x => x !== null)
      .join(",");

    const timeLimit = 20;

    csv += [
      rowNum,
      this.csvEscape(q.text),
      this.csvEscape(a1),
      this.csvEscape(a2),
      this.csvEscape(a3),
      this.csvEscape(a4),
      timeLimit,
      this.csvEscape(correctIndexes)
    ].join(",") + "\n";
  });

  // Fill remaining rows up to 100
  for (let i = questions.length + 1; i <= 100; i++) {
    csv += `${i},,,,,,,\n`;
  }

  return csv;
}


  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat
  ): Promise<FileData[]> {

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const xmlText = decoder.decode(inputFile.bytes);

      // Parse XML
      const xmlObj = parseXML(xmlText);

      // Extract questions
      const questions = this.extractQuestions(xmlObj);

      // Build CSV
      const csvText = this.buildBlooketCSV(questions);

      const outputBytes = encoder.encode(csvText);
      const newName = inputFile.name.replace(/\.[^/.]+$/, "") + ".csv";

      outputFiles.push({ bytes: outputBytes, name: newName });
    }

    return outputFiles;
  }
}

export default schoologyToBlooketHandler;
