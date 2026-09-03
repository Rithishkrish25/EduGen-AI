# Bugfix Requirements Document

## Introduction

The EduGen AI backend crashes with a PostgreSQL error — `column sub.subject_category does not exist` — whenever any query in `subject.service.ts` executes. The `subjects` table is missing the `subject_category` column because a migration file that adds it (`backend/migrations/20240101000000_add_subject_category.sql`) was written but never applied to the live database. The application code already references `sub.subject_category` across multiple queries (SELECT, INSERT, UPDATE), so every subject-related API call fails until the column exists.

The fix is to apply the existing migration against the live database and to prevent the same class of problem from recurring by adding a migration runner script to the project.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN any query in `subject.service.ts` executes (list, get, create, update, or status-change) THEN the system throws `error: column "sub.subject_category" does not exist` and the request fails with a 500 error.

1.2 WHEN the application starts and a subject-related endpoint is called THEN the system cannot return subject data because the `subjects` table schema in the live database does not include the `subject_category` column that the query selects.

1.3 WHEN an INSERT or UPDATE for a subject is attempted THEN the system fails with a column-not-found error because `subject_category` is referenced in the INSERT column list and UPDATE SET clause.

### Expected Behavior (Correct)

2.1 WHEN any query in `subject.service.ts` executes after the migration is applied THEN the system SHALL succeed without column-not-found errors, returning or writing subject data including the nullable `subject_category` field.

2.2 WHEN the `subjects` table is inspected after the fix THEN the system SHALL expose a `subject_category VARCHAR(64) NULL` column and its corresponding index `idx_subjects_subject_category`.

2.3 WHEN a subject is created or updated with a `subjectCategory` value THEN the system SHALL persist that value in the `subject_category` column; when no value is supplied THEN the system SHALL store `NULL`.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a subject is queried with valid inputs that were working before the `subject_category` column was referenced in code THEN the system SHALL CONTINUE TO return all other subject fields (`id`, `subject_code`, `subject_name`, `description`, `credits`, `is_active`, `department_id`, `semester_id`, `created_by`, `created_at`, `updated_at`, `department_name`, `department_code`, `semester_number`, `semester_name`, `academic_year_name`) with their original values intact.

3.2 WHEN existing subjects that have no `subject_category` value are retrieved THEN the system SHALL CONTINUE TO return them successfully, with `subject_category` as `NULL`.

3.3 WHEN the `subjects` table is modified by the migration THEN all existing rows SHALL CONTINUE TO be present with all existing column data preserved (no data loss).

3.4 WHEN other tables (`departments`, `semesters`, `academic_years`, `staff_subject_assignments`, `units`, `topics`, `course_outcomes`) are unaffected by the migration THEN the system SHALL CONTINUE TO operate those tables exactly as before.

---

## Bug Condition (Formal Specification)

**Bug Condition Function** — identifies requests that trigger the defect:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type SubjectQueryRequest
  OUTPUT: boolean

  // The bug fires on every subject-related query because the column is missing
  // from the live DB schema, regardless of the query's filter parameters.
  RETURN subjects_table_has_column("subject_category") = FALSE
END FUNCTION
```

**Fix Checking Property:**

```pascal
// Property: Fix Checking — column must exist after migration
FOR ALL X WHERE isBugCondition(X) DO
  result ← executeQuery'(X)   // query run against fixed schema
  ASSERT result.error IS NULL
  ASSERT subjects_table_has_column("subject_category") = TRUE
END FOR
```

**Preservation Checking Property:**

```pascal
// Property: Preservation — existing rows and other tables are unaffected
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT rowCount(subjects) UNCHANGED
  ASSERT columnValues(subjects, excluding "subject_category") UNCHANGED
  ASSERT schema(departments, semesters, academic_years, ...) UNCHANGED
END FOR
```
