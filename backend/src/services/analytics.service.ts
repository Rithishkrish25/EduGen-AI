import { pool } from "../config/database";

export interface OverviewAnalytics {
  totalUsers: number;
  activeUsers: number;
  students: number;
  staff: number;
  admins: number;
  departments: number;
  subjects: number;
  approvedDocuments: number;
  generatedNotes: number;
  quizAttempts: number;
  questionPapers: number;
  aiRequestsToday: number;
  aiRequestsThisMonth: number;
  failedAiRequestsToday: number;
}

export async function getOverviewAnalytics(): Promise<OverviewAnalytics> {
  const [userStats, departments, subjects, approvedDocuments, generatedNotes, quizAttempts, questionPapers, aiStats] =
    await Promise.all([
      pool.query<{
        total_users: string;
        active_users: string;
        students: string;
        staff: string;
        admins: string;
      }>(
        `SELECT COUNT(*) AS total_users,
                COUNT(*) FILTER (WHERE is_active) AS active_users,
                COUNT(*) FILTER (WHERE role = 'student') AS students,
                COUNT(*) FILTER (WHERE role = 'staff') AS staff,
                COUNT(*) FILTER (WHERE role = 'admin') AS admins
         FROM users`
      ),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM departments`),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM subjects`),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM documents WHERE is_approved = TRUE`),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM generated_notes`),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM quiz_attempts`),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM question_papers`),
      pool.query<{ today: string; this_month: string; failed_today: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS this_month,
           COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND success = FALSE) AS failed_today
         FROM ai_usage_events`
      ),
    ]);

  const users = userStats.rows[0];
  const ai = aiStats.rows[0];

  return {
    totalUsers: Number(users?.total_users ?? 0),
    activeUsers: Number(users?.active_users ?? 0),
    students: Number(users?.students ?? 0),
    staff: Number(users?.staff ?? 0),
    admins: Number(users?.admins ?? 0),
    departments: Number(departments.rows[0]?.count ?? 0),
    subjects: Number(subjects.rows[0]?.count ?? 0),
    approvedDocuments: Number(approvedDocuments.rows[0]?.count ?? 0),
    generatedNotes: Number(generatedNotes.rows[0]?.count ?? 0),
    quizAttempts: Number(quizAttempts.rows[0]?.count ?? 0),
    questionPapers: Number(questionPapers.rows[0]?.count ?? 0),
    aiRequestsToday: Number(ai?.today ?? 0),
    aiRequestsThisMonth: Number(ai?.this_month ?? 0),
    failedAiRequestsToday: Number(ai?.failed_today ?? 0),
  };
}

export interface UserAnalytics {
  usersByRole: Array<{ role: string; count: number }>;
  activeVsInactive: { active: number; inactive: number };
  studentsByDepartment: Array<{ department: string; count: number }>;
  staffByDepartment: Array<{ department: string; count: number }>;
  registrationsByDay: Array<{ day: string; count: number }>;
}

export async function getUserAnalytics(): Promise<UserAnalytics> {
  const [byRole, activeStatus, studentsByDept, staffByDept, registrations] = await Promise.all([
    pool.query<{ role: string; count: string }>(
      `SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY role`
    ),
    pool.query<{ active: string; inactive: string }>(
      `SELECT COUNT(*) FILTER (WHERE is_active) AS active,
              COUNT(*) FILTER (WHERE NOT is_active) AS inactive
       FROM users`
    ),
    pool.query<{ department: string; count: string }>(
      `SELECT COALESCE(department, 'Unspecified') AS department, COUNT(*) AS count
       FROM users WHERE role = 'student' GROUP BY department ORDER BY count DESC`
    ),
    pool.query<{ department: string; count: string }>(
      `SELECT COALESCE(department, 'Unspecified') AS department, COUNT(*) AS count
       FROM users WHERE role = 'staff' GROUP BY department ORDER BY count DESC`
    ),
    pool.query<{ day: string; count: string }>(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day ASC`
    ),
  ]);

  return {
    usersByRole: byRole.rows.map((row) => ({ role: row.role, count: Number(row.count) })),
    activeVsInactive: {
      active: Number(activeStatus.rows[0]?.active ?? 0),
      inactive: Number(activeStatus.rows[0]?.inactive ?? 0),
    },
    studentsByDepartment: studentsByDept.rows.map((row) => ({
      department: row.department,
      count: Number(row.count),
    })),
    staffByDepartment: staffByDept.rows.map((row) => ({
      department: row.department,
      count: Number(row.count),
    })),
    registrationsByDay: registrations.rows.map((row) => ({
      day: row.day,
      count: Number(row.count),
    })),
  };
}

export interface AiUsageAnalytics {
  requestsByFeature: Array<{ feature: string; count: number }>;
  requestsByRole: Array<{ role: string; count: number }>;
  successVsFailed: { successful: number; failed: number };
  dailyUsage: Array<{ day: string; count: number }>;
}

export async function getAiUsageAnalytics(): Promise<AiUsageAnalytics> {
  const [byFeature, byRole, successStatus, daily] = await Promise.all([
    pool.query<{ feature: string; count: string }>(
      `SELECT feature, COUNT(*) AS count FROM ai_usage_events GROUP BY feature ORDER BY count DESC`
    ),
    pool.query<{ role: string; count: string }>(
      `SELECT role, COUNT(*) AS count FROM ai_usage_events GROUP BY role ORDER BY role`
    ),
    pool.query<{ successful: string; failed: string }>(
      `SELECT COUNT(*) FILTER (WHERE success) AS successful,
              COUNT(*) FILTER (WHERE NOT success) AS failed
       FROM ai_usage_events`
    ),
    pool.query<{ day: string; count: string }>(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM ai_usage_events WHERE created_at >= NOW() - INTERVAL '14 days'
       GROUP BY day ORDER BY day ASC`
    ),
  ]);

  return {
    requestsByFeature: byFeature.rows.map((row) => ({ feature: row.feature, count: Number(row.count) })),
    requestsByRole: byRole.rows.map((row) => ({ role: row.role, count: Number(row.count) })),
    successVsFailed: {
      successful: Number(successStatus.rows[0]?.successful ?? 0),
      failed: Number(successStatus.rows[0]?.failed ?? 0),
    },
    dailyUsage: daily.rows.map((row) => ({ day: row.day, count: Number(row.count) })),
  };
}

export interface AcademicAnalytics {
  departmentsCount: number;
  subjectsCount: number;
  subjectsByDepartment: Array<{ department: string; count: number }>;
  activeStaffAssignments: number;
  unitsCount: number;
  topicsCount: number;
  courseOutcomesCount: number;
}

export async function getAcademicAnalytics(): Promise<AcademicAnalytics> {
  const [departments, subjects, subjectsByDept, assignments, units, topics, courseOutcomes] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM departments`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM subjects`),
    pool.query<{ department: string; count: string }>(
      `SELECT d.name AS department, COUNT(s.id) AS count
       FROM departments d
       LEFT JOIN subjects s ON s.department_id = d.id
       GROUP BY d.name ORDER BY count DESC`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM staff_subject_assignments WHERE is_active = TRUE`
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM units`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM topics`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM course_outcomes`),
  ]);

  return {
    departmentsCount: Number(departments.rows[0]?.count ?? 0),
    subjectsCount: Number(subjects.rows[0]?.count ?? 0),
    subjectsByDepartment: subjectsByDept.rows.map((row) => ({
      department: row.department,
      count: Number(row.count),
    })),
    activeStaffAssignments: Number(assignments.rows[0]?.count ?? 0),
    unitsCount: Number(units.rows[0]?.count ?? 0),
    topicsCount: Number(topics.rows[0]?.count ?? 0),
    courseOutcomesCount: Number(courseOutcomes.rows[0]?.count ?? 0),
  };
}

export interface ContentAnalytics {
  uploadedDocumentCount: number;
  approvedDocuments: number;
  processingCompleted: number;
  processingFailed: number;
  generatedNotesCount: number;
  generatedQuestionsCount: number;
  quizCount: number;
  questionPapersCount: number;
}

export async function getContentAnalytics(): Promise<ContentAnalytics> {
  const [documentStats, notes, questions, quizzes, questionPapers] = await Promise.all([
    pool.query<{
      total: string;
      approved: string;
      completed: string;
      failed: string;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE is_approved) AS approved,
              COUNT(*) FILTER (WHERE processing_status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE processing_status = 'failed') AS failed
       FROM documents`
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM generated_notes`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM generated_questions`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM quizzes`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM question_papers`),
  ]);

  const documents = documentStats.rows[0];

  return {
    uploadedDocumentCount: Number(documents?.total ?? 0),
    approvedDocuments: Number(documents?.approved ?? 0),
    processingCompleted: Number(documents?.completed ?? 0),
    processingFailed: Number(documents?.failed ?? 0),
    generatedNotesCount: Number(notes.rows[0]?.count ?? 0),
    generatedQuestionsCount: Number(questions.rows[0]?.count ?? 0),
    quizCount: Number(quizzes.rows[0]?.count ?? 0),
    questionPapersCount: Number(questionPapers.rows[0]?.count ?? 0),
  };
}
