"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import {
  AiConversation,
  GeneratedNote,
  GeneratedQuestion,
  listConversations,
  listGeneratedQuestions,
  listQuizAttempts,
  listStudentNotes,
  QuizAttempt,
} from "@/lib/api";

type HistoryType = "notes" | "questions" | "conversations" | "attempts";

const TYPE_LABELS: Record<HistoryType, string> = {
  notes: "Notes",
  questions: "Important Questions",
  conversations: "Conversations",
  attempts: "Quiz Attempts",
};

interface HistoryPanelProps {
  subjectId: string;
}

export default function HistoryPanel({ subjectId }: HistoryPanelProps) {
  const [type, setType] = useState<HistoryType>("notes");
  const [loading, setLoading] = useState(true);

  const [notes, setNotes] = useState<GeneratedNote[]>([]);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        if (type === "notes") {
          const data = await listStudentNotes({ subjectId, limit: 20 });
          if (active) setNotes(data.items);
        } else if (type === "questions") {
          const data = await listGeneratedQuestions({ subjectId, limit: 20 });
          if (active) setQuestions(data.items);
        } else if (type === "conversations") {
          const data = await listConversations({ subjectId, limit: 20 });
          if (active) setConversations(data.items);
        } else {
          const data = await listQuizAttempts({ subjectId, limit: 20 });
          if (active) setAttempts(data.items);
        }
      } catch {
        if (active) {
          if (type === "notes") setNotes([]);
          else if (type === "questions") setQuestions([]);
          else if (type === "conversations") setConversations([]);
          else setAttempts([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [subjectId, type]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPE_LABELS) as HistoryType[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setLoading(true);
              setType(option);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              type === option
                ? "border-primary text-primary"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {TYPE_LABELS[option]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading history...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {type === "notes" &&
            (notes.length === 0 ? (
              <EmptyState label="notes" />
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {note.output_type.replace(/_/g, " ")}
                    {note.topic_text ? ` - ${note.topic_text}` : ""}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(note.created_at)}
                  </p>
                </div>
              ))
            ))}

          {type === "questions" &&
            (questions.length === 0 ? (
              <EmptyState label="generated questions" />
            ) : (
              questions.map((question) => (
                <div key={question.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="text-foreground">{question.question_text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {question.marks} marks - {question.difficulty} -{" "}
                    {formatDateTime(question.created_at)}
                  </p>
                </div>
              ))
            ))}

          {type === "conversations" &&
            (conversations.length === 0 ? (
              <EmptyState label="conversations" />
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <p className="font-medium text-foreground">
                    {conversation.title || "Untitled conversation"}
                  </p>
                  <p className="text-xs text-muted">
                    Updated {formatDateTime(conversation.updated_at)}
                  </p>
                </div>
              ))
            ))}

          {type === "attempts" &&
            (attempts.length === 0 ? (
              <EmptyState label="quiz attempts" />
            ) : (
              attempts.map((attempt) => (
                <div key={attempt.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {attempt.submitted_at
                      ? `${attempt.correct_count}/${attempt.total_questions} correct (${attempt.percentage}%)`
                      : "In progress"}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(attempt.started_at)}
                  </p>
                  {attempt.submitted_at && (
                    <a
                      href={`/student/quiz-results/${attempt.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View Result
                    </a>
                  )}
                </div>
              ))
            ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
      No {label} yet for this subject.
    </p>
  );
}
