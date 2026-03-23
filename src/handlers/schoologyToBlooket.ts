import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";
import parseXML from "./envelope/parseXML.js";

class schoologyToBlooketHandler implements FormatHandler {

  public name: string = "Schoology to Blooket";
  public ready: boolean = true;

  public supportedFormats: FileFormat[] = [
      CommonFormats.SCHOOLOGY.supported("schoologyxml", true, false),
      CommonFormats.BLOOKET.supported("blooketcsv", false, true)
  ];
  async init() {
    this.ready = true;
  }

  // Escape CSV fields safely
  csvEscape(str: string): string {
    if (str == null) return "";
    str = String(str);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  }

  // Extract plain text from Schoology XML <TEXT> nodes
  extractText(node: any): string {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(x => this.extractText(x)).join(" ");
    if (typeof node === "object") {
      if ("_text" in node) return node._text;
      if ("TEXT" in node) return this.extractText(node.TEXT);
      if ("_children" in node) return node._children.map((c: any) => this.extractText(c)).join(" ");
    }
    return "";
  }

  // Extract all multiple-choice questions from Schoology XML
  extractQuestions(xmlObj: any) {
    const questions: any[] = [];

    function walk(node: any, callback: (q: any) => void) {
      if (!node || typeof node !== "object") return;
      for (const key of Object.keys(node)) {
        const val = node[key];

        if (key === "QUESTION_MULTIPLECHOICE") {
          if (Array.isArray(val)) {
            val.forEach(q => callback(q));
          } else {
            callback(val);
          }
        }

        if (typeof val === "object") walk(val, callback);
      }
    }

    walk(xmlObj, qNode => {
      const body = qNode.BODY?.TEXT ?? "";
      const questionText = this.extractText(body).trim();

      const answersRaw = qNode.ANSWER ?? [];
      const answers = [];

      if (Array.isArray(answersRaw)) {
        for (const ans of answersRaw) {
          const text = this.extractText(ans.TEXT).trim();
          answers.push({ id: ans._attributes?.id, text });
        }
      } else if (typeof answersRaw === "object") {
        const text = this.extractText(answersRaw.TEXT).trim();
        answers.push({ id: answersRaw._attributes?.id, text });
      }

      const correct = qNode.GRADABLE?.CORRECTANSWER?._attributes?.answer_id ?? "";

      questions.push({
        text: questionText,
        answers,
        correct
      });
    });

    return questions;
  }

  // Build Blooket CSV from extracted questions
  buildBlooketCSV(questions: any[]): string {
    let csv = "Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time Limit (sec),Correct Answer(s)\n";

    questions.forEach((q, index) => {
      const rowNum = index + 1;

      // Extract up to 4 answers
      const a1 = q.answers[0]?.text ?? "";
      const a2 = q.answers[1]?.text ?? "";
      const a3 = q.answers[2]?.text ?? "";
      const a4 = q.answers[3]?.text ?? "";

      // Determine correct answer index(es)
      const correctIndexes = q.answers
        .map((a: any, i: number) => (a.id === q.correct ? (i + 1) : null))
        .filter((x: number | null) => x !== null)
        .join(",");

      const timeLimit = 20; // default

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
