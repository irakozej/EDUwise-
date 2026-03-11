"""
Background job: runs every 30 minutes.
Sends a notification to every enrolled student who hasn't submitted a
self-paced quiz whose deadline is within the next 6 hours.
"""
from datetime import datetime, timezone, timedelta

from app.db.session import SessionLocal
from app.models.quiz import Quiz, QuizAttempt
from app.models.enrollment import Enrollment
from app.models.course import Lesson, Module, Course
from app.services.notifications import push_notification


def send_deadline_reminders() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        window_end = now + timedelta(hours=6)

        # Find self_paced quizzes whose deadline falls in the next 6 hours
        upcoming = (
            db.query(Quiz)
            .filter(
                Quiz.quiz_type == "self_paced",
                Quiz.is_published == True,  # noqa: E712
                Quiz.deadline != None,       # noqa: E711
                Quiz.deadline > now,
                Quiz.deadline <= window_end,
            )
            .all()
        )

        for quiz in upcoming:
            lesson = db.get(Lesson, quiz.lesson_id)
            if not lesson:
                continue
            module = db.get(Module, lesson.module_id)
            if not module:
                continue
            course = db.get(Course, module.course_id)
            if not course:
                continue

            # Students enrolled in this course
            enrollments = (
                db.query(Enrollment)
                .filter(
                    Enrollment.course_id == module.course_id,
                    Enrollment.status == "active",
                )
                .all()
            )

            # Students who already submitted
            submitted_ids = {
                row.student_id
                for row in db.query(QuizAttempt)
                .filter(
                    QuizAttempt.quiz_id == quiz.id,
                    QuizAttempt.is_submitted == True,  # noqa: E712
                )
                .all()
            }

            deadline_str = quiz.deadline.strftime("%b %d at %H:%M UTC")
            hours_left = int((quiz.deadline - now).total_seconds() // 3600)
            mins_left = int(((quiz.deadline - now).total_seconds() % 3600) // 60)
            time_label = f"{hours_left}h {mins_left}m" if hours_left > 0 else f"{mins_left}m"

            for enroll in enrollments:
                if enroll.student_id in submitted_ids:
                    continue  # already done
                push_notification(
                    db,
                    enroll.student_id,
                    "quiz_deadline",
                    f'Deadline approaching: "{quiz.title}"',
                    f'You have {time_label} left to complete "{quiz.title}" in "{course.title}". Deadline: {deadline_str}.',
                    f"/student/courses/{module.course_id}",
                )

        db.commit()
    except Exception as e:
        print(f"[deadline_reminders] Error: {e}")
        db.rollback()
    finally:
        db.close()
