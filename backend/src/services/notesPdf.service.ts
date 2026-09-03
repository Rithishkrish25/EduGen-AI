import { getTopicById, getUnitById } from "./academicContent.service";
import {
  checkPageBreak,
  createPdfDocument,
  drawReportHeader,
  drawSectionTitle,
  finalizePdf,
  useLatinFont,
  useUnicodeFont,
} from "./pdf.service";
import { GeneratedPdf } from "./questionPaperPdf.service";
import { getSubjectRawById } from "./subject.service";
import { GeneratedNoteRow, NoteOutputType } from "../types";

const OUTPUT_TYPE_LABELS: Record<NoteOutputType, string> = {
  short_notes: "Short Notes",
  detailed_notes: "Detailed Notes",
  exam_notes: "Exam Notes",
  revision_notes: "Revision Notes",
  key_points: "Key Points",
  comparison_notes: "Comparison Notes",
  summary: "Summary",
};

export async function generateNotePdf(note: GeneratedNoteRow): Promise<GeneratedPdf> {
  const subject = await getSubjectRawById(note.subject_id);

  let topicLabel = note.topic_text;
  if (note.topic_id) {
    const topic = await getTopicById(note.topic_id);
    if (topic) topicLabel = topic.topic_name;
  } else if (note.unit_id) {
    const unit = await getUnitById(note.unit_id);
    if (unit) topicLabel = `Unit ${unit.unit_number}: ${unit.unit_title}`;
  }

  const doc = createPdfDocument();
  const useUnicode = note.language === "tamil" || note.language === "tanglish";

  drawReportHeader(doc, [
    subject ? `${subject.subject_code} - ${subject.subject_name}` : "",
    `${OUTPUT_TYPE_LABELS[note.output_type]}${topicLabel ? ` - ${topicLabel}` : ""}`,
    `Generated: ${new Date(note.created_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`,
  ]);

  if (useUnicode) {
    useUnicodeFont(doc);
  } else {
    useLatinFont(doc);
  }
  doc.fontSize(10).text(note.content);
  doc.moveDown(0.6);

  if (note.citations.length > 0) {
    checkPageBreak(doc, 40);
    drawSectionTitle(doc, "Source References");
    useLatinFont(doc, false);
    note.citations.forEach((citation, index) => {
      const location = citation.pageNumber
        ? `page ${citation.pageNumber}`
        : citation.slideNumber
          ? `slide ${citation.slideNumber}`
          : null;
      checkPageBreak(doc, 20);
      doc
        .fontSize(9)
        .text(`[${index + 1}] ${citation.documentName}${location ? ` (${location})` : ""}`);
    });
  }

  const buffer = await finalizePdf(doc);
  return {
    buffer,
    filename: `Notes_${subject?.subject_code ?? "Subject"}_${note.output_type}`,
  };
}
