/**
 * Definition of file format. Contains format defined constants like mime type and names
 */
export interface IFormatDefinition {
  /** Format description (long name) for displaying to the user. */
  name: string;
  /** Short, "formal" name for displaying to the user, and for
   * differentiating between files of identical MIME types.
   * If your file is different from others of the same MIME type,
   * then this string should be used to differentiate it. */
  format: string;
  /** File extension. */
  extension: string;
  /** MIME type. */
  mime: string;
  /** Category for grouping formats. */
  category?: Array<string> | string
}

export interface FileFormat extends IFormatDefinition {
  /** Whether conversion **from** this format is supported. */
  from: boolean;
  /** Whether conversion **to** this format is supported. */
  to: boolean;
  /** Format identifier for the handler's internal reference. */
  internal: string;
  /** (Optional) Whether the format is lossless in this context. Defaults to `false`. */
  lossless?: boolean;
}

/**
 * Class containing format definition and method used to produce FileFormat
 * that can be supported by handlers.
 */
export class FormatDefinition implements IFormatDefinition {
  public readonly name: string;
  public readonly format: string;
  public readonly extension: string;
  public readonly mime: string;
  public readonly category?: string[] | string;

  constructor(
    name: string,
    format: string,
    extension: string,
    mime: string,
    category?: string[] | string
  ) {
    this.name = name
    this.format = format
    this.extension = extension
    this.mime = mime
    this.category = category
  }

  /**
   * Returns `FileFormat` object that uses this format definition
   * and specified options
   * @param ref Format identifier for the handler's internal reference.
   * @param from Whether conversion **from** this format is supported.
   * @param to Whether conversion **to** this format is supported.
   * @param lossless (Optional) Whether the format is lossless in this context. Defaults to `false`.
   * @param override Format definition values to override
   * @returns
   */
  supported(ref: string, from: boolean, to: boolean, lossless?: boolean, override: Partial<IFormatDefinition> = {}): FileFormat {
    return {
      ...this,
      ...override,
      internal: ref,
      from: from,
      to: to,
      lossless: lossless ?? false
    }
  }

  /**
   * Returns a builder to fluently create FileFormat.
   * Builder can be used to create FileFormat based on this format definition
   */
  builder(ref: string) {
    const def = this;

    const builder = {
      // FileFormat fields
      name: def.name,
      format: def.format,
      extension: def.extension,
      mime: def.mime,
      category: def.category,
      internal: ref,
      from: false,
      to: false,
      lossless: false,

      allowFrom(value: boolean = true) {
        this.from = value;
        return this;
      },
      allowTo(value: boolean = true) {
        this.to = value;
        return this;
      },
      markLossless(value: boolean = true) {
        this.lossless = value;
        return this;
      },
      named(name: string) {
        this.name = name;
        return this;
      },
      withFormat(format: string) {
        this.format = format;
        return this;
      },
      withExt(ext: string) {
        this.extension = ext;
        return this;
      },
      withMime(mimetype: string) {
        this.mime = mimetype;
        return this;
      },
      /**
       * Replaces format category
       */
      withCategory(category: string[] | string | undefined) {
        this.category = category
        return this
      },
      override(values: Partial<IFormatDefinition>) {
        Object.assign(this, values);
        return this;
      },
    };

    return builder as FileFormat & typeof builder;
  }
}


export interface FileData {
  /** File name with extension. */
  name: string;
  /**
   * File contents in bytes.
   *
   * **Please note:** _handlers_ are responsible for ensuring the lifetime
   * and consistency of this buffer. If you're not sure that your handler
   * won't modify it, wrap it in `new Uint8Array()`.
   */
  readonly bytes: Uint8Array;
}

/**
 * Establishes a common interface for converting between file formats.
 * Often a "wrapper" for existing tools.
 */
export interface FormatHandler {
  /** Name of the tool being wrapped (e.g. "FFmpeg"). */
  name: string;
  /** List of supported input/output {@link FileFormat}s. */
  supportedFormats?: FileFormat[];

  /** Whether the handler supports input of any type.
   * Conversion using this handler will be performed only if no other direct conversion is found.
   */
  supportAnyInput?: boolean;

  /**
   * Whether the handler is ready for use. Should be set in {@link init}.
   * If true, {@link doConvert} is expected to work.
   */
  ready: boolean;
  /**
   * Initializes the handler if necessary.
   * Should set {@link ready} to true.
   */
  init: () => Promise<void>;
  /**
   * Performs the actual file conversion.
   * @param inputFiles Array of {@link FileData} entries, one per input file.
   * @param inputFormat Input {@link FileFormat}, the same for all inputs.
   * @param outputFormat Output {@link FileFormat}, the same for all outputs.
   * @param args Optional arguments as a string array.
   * Can be used to perform recursion with different settings.
   * @returns Array of {@link FileData} entries, one per generated output file.
   */
  doConvert: (
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    args?: string[]
  ) => Promise<FileData[]>;
}

export class ConvertPathNode {
  public handler: FormatHandler;
  public format: FileFormat;
  constructor(handler: FormatHandler, format: FileFormat) {
    this.handler = handler;
    this.format = format;
  }
}
Here's my handler that exports, but only the heading
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "../CommonFormats.ts";
import parseXML from "./envelope/parseXML.js";

class schoologyToBlooketHandler implements FormatHandler {

  public name = "Schoology → Blooket";
  public ready = true;


  public supportedFormats: FileFormat[] = [
  // Accept XML as input (Schoology exports are XML)
  CommonFormats.XML.builder("xml").allowFrom(),

  // Output CSV (Blooket import format)
  CommonFormats.CSV.builder("csv").allowTo()
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
