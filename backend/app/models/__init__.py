from app.models.user import User, UserRole
from app.models.audit_log import AuditLog
from app.models.refresh_token import RefreshToken
from app.models.course import Course, Module, Lesson, Resource
from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
from app.models.event import Event
from app.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from app.models.assignment import Assignment, Submission
from app.models.announcement import Announcement
from app.models.comment import Comment
from app.models.notification import Notification
from app.models.message import Message
from app.models.password_reset import PasswordResetToken
from app.models.gamification import XPLog, StudentBadge
from app.models.note import StudentNote
from app.models.peer_review import PeerReview
from app.models.prerequisite import CoursePrerequisite
from app.models.exercise import ExerciseAttempt, ExerciseQuestion, ExerciseAnswer
