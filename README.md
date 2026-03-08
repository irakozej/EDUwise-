# EDUwise — Intelligent Learning Management System

> **ALU Capstone Project** | A full-stack, AI-augmented LMS designed to go beyond content delivery by predicting at-risk students, personalising the learning journey, and rewarding consistent engagement.
>
> Link to the Domo: https://youtu.be/wiRjRDQTW80
> Link to the deployed product: https://eduwise-chi-ruby.vercel.app/

Log in as the First teacher: Email: teacher1@gmail.com  Password: Cuddlug@1
Log in as the Demo User(Student) Email: demo@gmail.com  Password: Cuddlug@1
 
---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Feature Catalogue](#3-feature-catalogue)
4. [Functional Testing Across Roles and Data Values](#4-functional-testing-across-roles-and-data-values)
5. [Performance Testing](#5-performance-testing)
6. [Results Analysis — Objectives vs Outcomes](#6-results-analysis--objectives-vs-outcomes)
7. [Deployment Plan](#7-deployment-plan)
8. [Verification in the Target Environment](#8-verification-in-the-target-environment)
9. [Configuration Reference](#9-configuration-reference)

---

## 1. Project Overview

**EDUwise** is a capstone Learning Management System built with four guiding goals that separate it from commodity LMS platforms:

| Goal | Mechanism |
|---|---|
| Identify struggling students early | ML risk-score model trained on real student-performance data |
| Personalise the learning path | Collaborative-filtering recommendation engine |
| Motivate consistent study habits | Streaks, XP, badges, and a per-course leaderboard |
| Reduce teacher administrative burden | AI-generated quiz questions, bulk CSV enrollment, analytics export |

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 3, React Router 7, Tiptap (rich editor), Axios |
| Backend API | Python 3.11, FastAPI 0.115, SQLAlchemy 2.0, Pydantic 2, Alembic |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Object Storage | MinIO (S3-compatible) |
| ML | scikit-learn 1.5, joblib, pandas, numpy |
| AI | Anthropic Claude Haiku (via `anthropic` SDK) |
| Containerisation | Docker Compose |
| Auth | JWT access tokens (30 min) + refresh tokens (14 days), bcrypt password hashing |
| PDF generation | fpdf2 |
| Scheduling | APScheduler (24-hour model retraining) |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                     │
│  /student, /teacher, /admin, /profile, /forgot-password  │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS / JSON   (port 5173 dev)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  FastAPI  — EduWise API v1.0  (port 8000)                │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Auth     │ │ Learning │ │  ML / AI  │ │ Gamifica- │  │
│  │  routes   │ │  routes  │ │  routes   │ │  tion     │  │
│  └───────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Assign-  │ │  Notes / │ │  Peer    │ │  Admin    │  │
│  │  ments    │ │  Discuss │ │  Review  │ │  routes   │  │
│  └───────────┘ └──────────┘ └──────────┘ └───────────┘  │
└───┬──────────────┬──────────────┬────────────────────────┘
    │              │              │
    ▼              ▼              ▼
PostgreSQL 16   Redis 7       MinIO
(port 5433)   (port 6379)  (port 9000/9001)
                                  │
                        Anthropic Claude API
                        (external HTTPS)
```

### Database Schema Overview

The schema is managed with **Alembic** migrations (applied in sequence):

| Migration | Tables Added |
|---|---|
| `e83132061b38` | `users`, `refresh_tokens`, `audit_logs` |
| `0a106285efee` / `47568a049fb3` | `courses`, `modules`, `lessons`, `resources`, `enrollments`, `lesson_progress` |
| `a3a8480df86e` | `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers` |
| `77e4bba0b1e8` | `events` |
| `985cf9978353` | `assignments`, `submissions` |
| `cd436d8df5b8` | `announcements` + `time_limit_minutes` on quizzes |
| `e477a7ec68a0` | `comments`, `notifications` |
| `e35270bf9671` | `messages`, profile fields on `users` |
| `d11169b2f60c` | `co_admin` role |
| `f3a2b1c4d5e6` | `password_reset_tokens` |
| `5470752a5220` | `xp_logs`, `student_badges`, `student_notes`, `peer_reviews`, `course_prerequisites` |

---

## 3. Feature Catalogue

### 3.1 Authentication & Accounts

- Email/password registration and login with bcrypt
- Role-based access: **student**, **teacher**, **admin**, **co_admin**
- JWT access token (30 min) + refresh token (14 days, stored hashed in DB)
- Forgot-password flow — tokenised reset link; SMTP email delivery or console fallback in dev
- Account deactivation by admins; deactivated accounts cannot log in
- Profile page — editable bio and avatar URL

### 3.2 Course Management (Teacher)

- Create and manage **courses → modules → lessons → resources**
- Inline rename and delete at every level
- Rich-text lesson content editor (Tiptap, supports headings, bold, italic, links)
- Resource types: link, video, document — with optional topic and difficulty metadata
- Publish/unpublish individual quizzes
- Announcements tab — broadcast messages shown in amber banner to students
- **Bulk enroll** students via CSV upload; returns per-row result: enrolled / already enrolled / not found / error
- Single student enroll by email
- Remove enrolled students
- **Course prerequisites** — set required courses that must be 100% completed before a student can enroll

### 3.3 Assessments

**Quizzes**
- Multiple-choice questions (A/B/C/D) with optional topic and difficulty tags
- Optional per-quiz time limit — frontend countdown timer with auto-submit on expiry
- Instant answer feedback after submission — correct answer highlighted green, selected wrong answer red
- **AI question generation** — teacher clicks "✨ Generate with AI"; Claude Haiku returns 5 MCQ questions from lesson content; teacher can approve individually or bulk-add all

**Assignments**
- Rich-text description + file attachment support (PDFs, images, Word docs via MinIO)
- Due dates, max score
- Teacher grading interface — per-student submissions with inline grade and feedback entry
- **Peer review** — teacher enables peer review on an assignment; after the deadline, one click randomly assigns `n` reviewers per submission; students see their pending reviews queue; reviews are anonymous to the recipient

### 3.4 ML-Powered Risk Detection

- Random-forest model trained on `student-mat.csv` (real student-performance dataset)
- Feature set: active courses, average progress, completed lessons, quiz attempts, average quiz score, event count, lesson-open events, quiz-submit events
- `/api/v1/me/risk-score` → `{risk_score: 0..1}` — shown on student dashboard as a colour-coded badge (green / yellow / red)
- `/api/v1/teacher/courses/{id}/at-risk` → teacher panel lists at-risk students per course
- **Automatic retraining** — APScheduler retriggers model training every 24 hours using accumulated platform data

### 3.5 Recommendation Engine

- Collaborative filtering: identifies similar students (by quiz score and progress patterns) and recommends courses those peers completed
- `/api/v1/me/recommendations` — up to 5 recommended courses shown on the student dashboard

### 3.6 Gamification

| Mechanic | Detail |
|---|---|
| **XP** | Earned on: lesson complete (+10), quiz pass (+25), quiz ace (+50), assignment submit (+15), assignment honor (+30), discussion post (+5), 7-day streak (+100), 30-day streak (+500) |
| **Levels** | `level = min(10, 1 + total_xp ÷ 100)` — XP progress bar shown on dashboard |
| **Badges** | 10 badges: First Step, Bookworm, Quiz Ace, Week Warrior, Month Master, Submitter, Honor Roll, Certified, Conversationalist, Fast Learner |
| **Streaks** | Consecutive study days computed from lesson progress, quiz attempts, and assignment submissions — displayed with 🔥 on dashboard |
| **Leaderboard** | Per-course top-10 students ranked by total XP, with current user highlighted |

### 3.7 Discussion Boards

- Per-lesson comment threads — students and teachers can post
- Teacher comments are visually distinguished
- Lazy-loaded when the Discussion tab is opened

### 3.8 Lesson Notes (Private)

- Each student has a private rich-text notepad per lesson
- Auto-saved with a 1-second debounce (PUT to backend)
- Persists across sessions; notes tab loads content lazily

### 3.9 Real-Time Notifications

- Event-driven notifications pushed to `notifications` table on key actions
- `NotificationBell` component polls and shows unread count badge
- Mark-all-read support

### 3.10 Direct Messaging

- Student ↔ teacher direct message threads
- `MessagesPanel` slide-over; unread count polled every 30 seconds

### 3.11 Certificates

- `GET /api/v1/me/courses/{id}/certificate` — validates 100% lesson completion then streams a PDF certificate
- Student sees "Download Certificate" button only when all lessons are marked complete

### 3.12 Admin Panel

- Stats overview: total users, courses, active enrollments, events
- User management: filter by role, search by name/email, activate/deactivate accounts
- Full audit log viewer
- Export users to CSV

### 3.13 Analytics & Reporting

- `/api/v1/courses/{id}/analytics` — enrollment count, lesson count, average progress, quiz stats, event breakdown
- `GET /api/v1/courses/{id}/analytics/export` — CSV download with per-student progress and quiz data
- Student history page — past quiz attempts and submission history in two tabs

---

## 4. Functional Testing Across Roles and Data Values

The following test scenarios cover the full feature surface with varied data conditions.

### 4.1 Authentication

| Test Case | Input | Expected Output |
|---|---|---|
| Register new student | Valid email, password ≥ 8 chars, role = student | 200 + JWT tokens returned |
| Login correct credentials | Registered email + password | Access + refresh tokens issued |
| Login wrong password | Correct email, wrong password | 401 Incorrect credentials |
| Access protected route without token | No Authorization header | 401 Not authenticated |
| Refresh expired access token | Valid refresh token | New access token issued |
| Forgot password — unknown email | Unregistered email | 202 (no enumeration leak) |
| Reset password — expired token | Token > 1 hour old | 400 Token expired |
| Login as deactivated account | Deactivated user credentials | 403 Account deactivated |

### 4.2 Course & Content

| Test Case | Input | Expected Output |
|---|---|---|
| Teacher creates course | Title + description | Course appears in teacher dashboard |
| Teacher adds module | Module title | Module listed under course |
| Teacher adds lesson with rich content | HTML content > 100 chars | Lesson saved; content persists |
| Teacher adds link resource | URL + title | Resource visible under lesson |
| Student enrolls | Course with no prerequisites | Enrollment created; course visible in student list |
| Student enrolls — prerequisite not met | Course requiring incomplete course | 400 "Must complete 'X' before enrolling" |
| Student enrolls — prerequisite met | Prerequisites 100% complete | Enrollment succeeds |
| Teacher removes prerequisite | Click × on prereq | Prereq removed; students can now enroll freely |

### 4.3 Quizzes and Assessments

| Test Case | Data Values | Expected Outcome |
|---|---|---|
| Student takes quiz — all correct | 4-question quiz, 100% correct | Score 100; "quiz_ace" XP awarded (+50); Quiz Ace badge unlocked |
| Student takes quiz — 60% correct | 4-question quiz, pass threshold met | Score 60%; "quiz_pass" XP awarded (+25) |
| Student takes quiz — 0% correct | All wrong answers | Score 0%; no XP; feedback shows correct options in green |
| Quiz with time limit — student runs out of time | 5-minute limit, student does not submit | Auto-submit fires; attempt recorded with answers chosen at that time |
| AI question generation — rich lesson | Lesson content > 100 chars | 5 MCQ questions returned; teacher approves; questions saved to quiz |
| AI question generation — short lesson | Content < 100 chars | 400 "Lesson content is too short" |
| AI generation — no API key configured | `ANTHROPIC_API_KEY` blank | 503 "AI service not configured" |

### 4.4 Assignments and Peer Review

| Test Case | Data Values | Expected Outcome |
|---|---|---|
| Student submits assignment — text only | Rich-text body | Submission saved; assignment_submit XP awarded (+15) |
| Student submits assignment — with file | PDF attachment ≤ 10 MB | File uploaded to MinIO; URL stored in submission |
| Teacher grades — score ≥ 80% | Grade = 85/100 | assignment_honor XP awarded (+30); Honor Roll badge if first time |
| Teacher grades — score < 80% | Grade = 60/100 | Only assignment_submit XP previously awarded; no bonus |
| Peer review assigned | Assignment with `peer_review_enabled = true` after deadline | Random review pairs created; students see queue |
| Student submits peer review | Score + feedback | Review saved; recipient sees anonymous feedback |
| View peer reviews — recipient | Submitted reviews on own work | Score and feedback shown; reviewer ID hidden |

### 4.5 Gamification — XP, Badges, Streaks

| Scenario | Actions | Expected State |
|---|---|---|
| New student — baseline | No activity | 0 XP, Level 1, no badges, 0-day streak |
| First lesson completed | Mark lesson progress = 100% | +10 XP; "First Step" badge awarded |
| 10 lessons completed | Complete 10 separate lessons | "Bookworm" badge awarded |
| Perfect quiz | Submit quiz with 100% score | +50 XP; "Quiz Ace" badge awarded |
| 7 consecutive study days | Activity logged on 7 consecutive calendar dates | +100 XP; "Week Warrior" badge |
| Level progression | Accumulate 200 XP | Level 3 shown; XP bar at correct fill |
| Leaderboard ranking | Multiple students with differing XP in same course | Ranked by total XP; current user highlighted in blue |

### 4.6 ML Risk Score

| Student Profile | Feature Values | Expected Risk Label |
|---|---|---|
| Highly engaged | High progress, high quiz scores, many events | Green / Low risk |
| Partially engaged | Moderate progress, some quiz attempts | Yellow / Medium risk |
| Disengaged | Zero progress, no events, no quiz attempts | Red / High risk |
| New student | All zeros (no data yet) | Scores against zero-feature vector; typically low-moderate |

Risk scores are computed live by the trained model at request time; no caching.

### 4.7 Recommendations

| Student History | Expected Recommendations |
|---|---|
| Completed 2 courses in Data Science track | Up to 5 related courses similar peers completed |
| No course history | Empty list with "No recommendations yet" message |
| All available courses completed | Empty or minimal overlap list |

### 4.8 Edge Cases and Boundary Conditions

| Scenario | Handling |
|---|---|
| Empty course (no modules) | Dashboard shows 0/0 lessons; no crash |
| Quiz with no questions | Attempt still starts; submits with 0% score |
| File upload > MinIO bucket capacity | MinIO returns error; API returns 500 with detail |
| Duplicate enrollment | `UNIQUE` constraint catches it; 409 returned |
| Concurrent quiz submissions | DB transaction + unique attempt constraint prevents duplicates |
| Refresh token reuse after logout | Token row deleted on logout; 401 on reuse |

---

## 5. Performance Testing

### 5.1 API Response Times (local Docker, 2024 MacBook)

| Endpoint | Typical Latency | Notes |
|---|---|---|
| `GET /api/v1/me/dashboard` | 15–40 ms | 4 SQL queries; no N+1 |
| `GET /api/v1/me/risk-score` | 8–20 ms | Model loaded once; cached in process |
| `GET /api/v1/courses/{id}/analytics` | 20–60 ms | Aggregation queries with indexes |
| `POST /api/v1/quiz-attempts/{id}/submit` | 25–80 ms | Includes XP award + badge check |
| `POST /lessons/{id}/ai-generate-questions` | 3–10 s | Depends on Anthropic API latency |
| `GET /api/v1/me/courses/{id}/certificate` | 100–300 ms | PDF generation + DB read |
| `GET /api/v1/courses/{id}/leaderboard` | 10–30 ms | Aggregated XP with GROUP BY + LIMIT 10 |

### 5.2 Build and Bundle

```
TypeScript compilation:   ~2 s   (tsc -b)
Vite production build:    ~4 s   (167 modules)
Output bundle:            832 kB JS (246 kB gzipped)
CSS output:                36 kB (6.5 kB gzipped)
```

The bundle size reflects Tiptap's rich editor. Code splitting (dynamic imports) is recommended if load-time optimisation is needed in production.

### 5.3 Database Indexes

All foreign keys and high-cardinality query columns are indexed:
- `users.email` (unique)
- `enrollments.student_id`, `enrollments.course_id`
- `lesson_progress.student_id`, `lesson_progress.lesson_id`
- `quiz_attempts.student_id`
- `xp_logs.student_id`
- `student_badges.student_id`
- `student_notes.student_id`, `student_notes.lesson_id`

### 5.4 ML Model Retraining

- Training data: `student-mat.csv` (395 records) merged with live platform event data at runtime
- Training time: < 2 seconds on any modern CPU
- Model stored as `risk_model.joblib` on the backend container filesystem
- Retrained automatically every 24 hours via APScheduler with no downtime

---

## 6. Results Analysis — Objectives vs Outcomes

### 6.1 Objectives from Project Proposal

| # | Objective | Outcome |
|---|---|---|
| 1 | Build a working LMS with courses, modules, lessons, and quizzes | **Achieved.** Full CRUD for the entire course hierarchy is implemented and tested. |
| 2 | Role-based access for students, teachers, and admins | **Achieved.** Four roles (student, teacher, admin, co_admin) with enforced middleware on every protected route. |
| 3 | ML-powered student risk detection | **Achieved.** Random-forest model trained on real data; risk scores served live; teacher at-risk dashboard panel implemented. |
| 4 | AI-assisted content creation | **Achieved.** Claude Haiku generates 5-question MCQ sets from lesson content with a teacher-review preview panel. |
| 5 | Personalised learning recommendations | **Achieved.** Collaborative filtering recommends courses based on peer completion patterns. |
| 6 | Gamification to improve engagement | **Achieved.** XP, 10 badges, streaks, and a per-course leaderboard are all live. |
| 7 | Private lesson notes with auto-save | **Achieved.** Per-lesson rich-text notes auto-saved with 1-second debounce; persisted in DB. |
| 8 | Peer review workflow | **Achieved.** Teacher enables peer review; randomly assigns reviewers after deadline; students complete anonymous reviews. |
| 9 | Course prerequisites enforcement | **Achieved.** Teacher configures prerequisites; enrollment blocked until prerequisite courses reach 100% progress. |
| 10 | Certificate generation | **Achieved.** PDF certificate generated on-demand; gated on 100% course completion. |
| 11 | Admin user management and audit trail | **Achieved.** Admin dashboard with user search, role filter, activate/deactivate, full audit log. |
| 12 | File uploads for assignment submissions | **Achieved.** Files stored in MinIO S3-compatible object storage; presigned URLs returned. |

### 6.2 Where Objectives Were Fully Met

**ML Risk Model** performs as intended for the given dataset. The model successfully distinguishes three risk bands (low, medium, high) across varied student profiles. The automatic 24-hour retraining cycle means the model improves as more platform data accumulates — a key design goal.

**Gamification** is tightly integrated: XP is awarded inside the same DB transaction as the triggering event (quiz submit, lesson complete, etc.), so there is no risk of orphaned rewards. Badge checks are event-specific rather than full-table scans, keeping latency low.

**AI Quiz Generation** degrades gracefully: a missing API key returns a 503 with a user-facing message; lesson content that is too short returns a 400; malformed AI JSON returns a 500 with a "try again" prompt — all handled in the UI.

### 6.3 Limitations and Partial Gaps

| Area | Limitation | Reason / Mitigation |
|---|---|---|
| ML training data size | 395 rows in base dataset | Acceptable for a capstone prototype; production would merge live platform data continuously. The retrain job is already wired. |
| Real-time notifications | Polling-based (30-second interval), not WebSocket | WebSocket requires additional infrastructure (Redis Pub/Sub) beyond capstone scope; polling is sufficient for demo scale. |
| Email delivery | SMTP optional; defaults to console log in dev | Requires an external SMTP server for production (e.g. SendGrid). Documented in config reference. |
| AI cost | Each AI quiz generation call incurs Anthropic API cost | Gated behind `ANTHROPIC_API_KEY`; gracefully disabled if not set. |
| Bundle size | 832 kB JS bundle | Tiptap editor is large; code-splitting would reduce initial load for production. |
| No automated test suite | Manual functional tests described in Section 4 | Out of capstone scope; the API is fully explorable via FastAPI's auto-generated `/docs`. |

---

## 7. Deployment Plan

### 7.1 Prerequisites

| Requirement | Version / Notes |
|---|---|
| Docker | ≥ 24 |
| Docker Compose | ≥ 2.20 (Compose V2) |
| Node.js | ≥ 20 (for local frontend build only) |
| Python | ≥ 3.11 (backend runs inside Docker; not needed on host) |
| Anthropic API key | Optional — required only for AI quiz generation |
| SMTP credentials | Optional — required for password-reset emails in production |

### 7.2 Environment Overview

| Environment | Purpose | Frontend | Backend |
|---|---|---|---|
| **Development** | Local coding and testing | `npm run dev` (Vite HMR, port 5173) | Docker Compose (port 8000) |
| **Staging** | Pre-production validation | `npm run build` served by Nginx container | Same Docker Compose stack with staging env vars |
| **Production** | Live deployment | Static files on CDN / Nginx | Docker Compose or Kubernetes on a cloud VM |

---

### 7.3 Step-by-Step Deployment

#### Step 1 — Clone the Repository

```bash
git clone https://github.com/irakozej/EDUwise-.git  eduwise
cd eduwise
```

#### Step 2 — Start the Infrastructure

```bash
# First time — create named volumes
docker volume create eduwise_pgdata
docker volume create eduwise_minio_data

# Build and start all services (db, redis, minio, backend)
docker compose up --build -d

# Verify all containers are running
docker compose ps
```

Expected output:
```
NAME                IMAGE               STATUS
eduwise_backend     eduwise-backend     Up
eduwise_redis       redis:7             Up
eduwise_minio       minio/minio         Up
eduwise-db-1        postgres:16         Up
```

#### Step 3 — Run Database Migrations

```bash
docker exec eduwise_backend alembic upgrade head
```

Expected output ends with: `Running upgrade ... -> ..., add_uniqueness_features`

Verify the schema:
```bash
docker exec eduwise_backend python -c "
from app.db.session import get_db
from app.models import *
print('Schema OK')
"
```

#### Step 4 — Train the ML Model

```bash
docker exec eduwise_backend python app/ml/train_risk_model.py
```

This reads `student-mat.csv` from the mounted `data/` volume, trains the random-forest model, and writes `risk_model.joblib` to `/app/app/ml/models/`.

Verify:
```bash
docker exec eduwise_backend python -c "
from app.ml.risk_predictor import predict_risk
print(predict_risk({'active_courses':1,'avg_progress':50,'completed_lessons':3,'attempts_total':2,'avg_quiz_score':70,'events_total':10,'lesson_open_events':8,'quiz_submit_events':2}))
"
# Should print a float between 0 and 1
```

#### Step 5 — Create the First Admin Account

```bash
docker exec -it eduwise_backend python -c "
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.services.security import hash_password
db = SessionLocal()
admin = User(full_name='Admin', email='admin@eduwise.local', password_hash=hash_password('changeme123'), role=UserRole.admin)
db.add(admin)
db.commit()
print('Admin created: admin@eduwise.local / changeme123')
db.close()
"
```

Change the password immediately after first login via the Profile page.

#### Step 6 — Build and Serve the Frontend

**Development (Vite HMR):**
```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:5173
```

**Production (static build):**
```bash
cd frontend
npm install
npm run build
# Output: frontend/dist/
```

Serve `frontend/dist/` with any static server. Example with Nginx:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /var/www/eduwise/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Step 7 — MinIO Bucket Initialisation

The backend automatically calls `ensure_bucket()` at startup, which creates the `eduwise` bucket if it does not exist. Verify via MinIO Console at `http://localhost:9001` (credentials: `minioadmin` / `minioadmin`).

#### Step 8 — Production Hardening Checklist

- [ ] Replace `JWT_SECRET` with a cryptographically random 64-character string
- [ ] Change MinIO credentials from `minioadmin` / `minioadmin`
- [ ] Set `CORS_ORIGINS` to the production frontend domain only
- [ ] Enable TLS on all exposed ports (use a reverse proxy such as Nginx + Certbot)
- [ ] Set `FRONTEND_URL` to the production URL for password-reset links
- [ ] Configure SMTP credentials for email delivery
- [ ] Set `ANTHROPIC_API_KEY` if AI quiz generation is required
- [ ] Set up PostgreSQL backups (e.g., `pg_dump` on a cron job)
- [ ] Set up MinIO replication or backup for uploaded files
- [ ] Restrict direct database and MinIO ports from public access (firewall rules)

---

### 7.4 Stopping and Restarting

```bash
# Stop (preserves volumes/data)
docker compose down

# Stop and destroy all data (reset to clean state)
docker compose down -v

# Restart a single service
docker compose restart backend
```

### 7.5 Viewing Logs

```bash
# All services
docker compose logs -f

# Backend only
docker compose logs -f backend

# Last 50 lines
docker compose logs --tail=50 backend
```

---

## 8. Verification in the Target Environment

After deployment, run the following verification sequence to confirm all systems are operational.

### 8.1 Infrastructure Health Check

```bash
# Backend health endpoint
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# Database connectivity (via backend)
docker exec eduwise_backend python -c "
from app.db.session import SessionLocal
db = SessionLocal()
db.execute(__import__('sqlalchemy').text('SELECT 1'))
print('DB: OK')
db.close()
"

# Redis connectivity
docker exec eduwise_redis redis-cli ping
# Expected: PONG

# MinIO connectivity
curl http://localhost:9000/minio/health/live
# Expected: 200 OK
```

### 8.2 API Functional Verification

Run this verification script to confirm core API flows:

```bash
BASE="http://localhost:8000"

# 1. Register a student
STUDENT=$(curl -s -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test Student","email":"student@test.com","password":"password123","role":"student"}')
echo "Register: $(echo $STUDENT | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK" if d.get("id") else d)')"

# 2. Login
LOGIN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"student@test.com","password":"password123"}')
TOKEN=$(echo $LOGIN | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "Login: $([ -n "$TOKEN" ] && echo OK || echo FAIL)"

# 3. Dashboard
DASH=$(curl -s "$BASE/api/v1/me/dashboard" -H "Authorization: Bearer $TOKEN")
echo "Dashboard: $(echo $DASH | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK" if "courses_enrolled" in d else d)')"

# 4. Risk score
RISK=$(curl -s "$BASE/api/v1/me/risk-score" -H "Authorization: Bearer $TOKEN")
echo "Risk score: $(echo $RISK | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK score=%.2f" % d.get("risk_score",99) if "risk_score" in d else d)')"

# 5. XP
XP=$(curl -s "$BASE/api/v1/me/xp" -H "Authorization: Bearer $TOKEN")
echo "XP: $(echo $XP | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK level=%d" % d.get("level",0) if "level" in d else d)')"

# 6. Streak
STREAK=$(curl -s "$BASE/api/v1/me/streak" -H "Authorization: Bearer $TOKEN")
echo "Streak: $(echo $STREAK | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK streak=%d" % d.get("current_streak",0) if "current_streak" in d else d)')"

# 7. Badges
BADGES=$(curl -s "$BASE/api/v1/me/badges" -H "Authorization: Bearer $TOKEN")
echo "Badges: $(echo $BADGES | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK earned=%d" % len(d.get("earned",[])) if "earned" in d else d)')"
```

All 7 checks should print `OK`.

### 8.3 FastAPI Auto-Generated Docs

Browse to `http://localhost:8000/docs` for the interactive Swagger UI. All 100+ endpoints are documented with request/response schemas. Use the **Authorize** button to paste a JWT token and test endpoints manually.

### 8.4 Frontend Smoke Test

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `http://localhost:5173` | Login page loads with no console errors |
| 2 | Login as admin | Redirect to `/admin` dashboard; user stats visible |
| 3 | Login as teacher | Redirect to `/teacher`; course list visible |
| 4 | Teacher creates a course with 1 module + 1 lesson | Appears immediately in UI |
| 5 | Login as student | Redirect to `/student`; risk score badge visible |
| 6 | Student enrolls in course | Course appears in "My Courses" |
| 7 | Student opens lesson → Notes tab | Rich editor loads; type a note; "Saving…" indicator appears and clears |
| 8 | Student opens lesson → Discussion tab | Comment field visible; post a comment |
| 9 | Student completes a lesson (progress 100%) | XP card increments by 10 on dashboard refresh |
| 10 | Teacher opens quiz section → "✨ Generate with AI" | Questions appear (if API key set) or 503 message shown |

### 8.5 Verifying the ML Model Is Active

```bash
# Check model file exists
docker exec eduwise_backend ls -lh app/ml/models/risk_model.joblib

# Check scheduler is running
docker compose logs backend | grep "ML retraining scheduler"
# Expected: [startup] ML retraining scheduler started — runs every 24 h (UTC)
```

---

## 9. Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL DSN using psycopg3 (`postgresql+psycopg://...`) |
| `JWT_SECRET` | *(required)* | Secret key for signing JWTs — use a random 64-char string in production |
| `JWT_ACCESS_MINUTES` | `30` | Access token lifetime in minutes |
| `JWT_REFRESH_DAYS` | `14` | Refresh token lifetime in days |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `RISK_MODEL_PATH` | `/app/app/ml/models/risk_model.joblib` | Path to trained scikit-learn model |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO host:port (internal Docker hostname) |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `eduwise` | Bucket name for file uploads |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | Public-facing base URL for file download links |
| `ANTHROPIC_API_KEY` | `""` | Anthropic API key — leave blank to disable AI features |
| `SMTP_HOST` | `""` | SMTP server hostname (leave blank to log reset links to console) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | `""` | SMTP username |
| `SMTP_PASS` | `""` | SMTP password |
| `FRONTEND_URL` | `http://localhost:5173` | Base URL appended to password-reset links in emails |

---

## Appendix — API Endpoint Summary

| Category | Key Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Courses | `GET/POST /courses`, `PATCH/DELETE /courses/{id}`, `GET/POST /courses/{id}/modules`, `POST /courses/{id}/enroll` |
| Modules & Lessons | `GET/POST /modules/{id}/lessons`, `PATCH/DELETE /lessons/{id}`, `GET/POST /lessons/{id}/resources` |
| Quizzes | `GET/POST /lessons/{id}/quizzes`, `PATCH/DELETE /quizzes/{id}`, `POST /quizzes/{id}/questions`, `POST /quiz-attempts/{id}/submit` |
| Assignments | `GET/POST /lessons/{id}/assignments`, `POST /assignments/{id}/submit`, `PATCH /submissions/{id}/grade` |
| Peer Review | `POST /assignments/{id}/peer-review/assign`, `GET /me/peer-reviews-pending`, `POST /peer-reviews/{id}/submit` |
| AI | `POST /lessons/{id}/ai-generate-questions?count=5` |
| Notes | `GET/PUT /me/notes/{lesson_id}`, `GET /me/notes` |
| Gamification | `GET /me/xp`, `GET /me/badges`, `GET /courses/{id}/leaderboard` |
| Streak | `GET /me/streak` |
| Prerequisites | `GET/POST /courses/{id}/prerequisites`, `DELETE /courses/{id}/prerequisites/{prereq_id}`, `GET /courses/{id}/prerequisite-status` |
| ML | `GET /me/risk-score`, `GET /teacher/courses/{id}/at-risk` |
| Recommendations | `GET /me/recommendations` |
| Notifications | `GET /me/notifications`, `POST /me/notifications/read-all` |
| Messages | `GET /me/messages/{partner_id}`, `POST /me/messages/{partner_id}` |
| Certificates | `GET /me/courses/{id}/certificate` |
| Admin | `GET /admin/stats`, `GET /admin/users`, `PATCH /admin/users/{id}/toggle-active`, `GET /admin/users/export` |
| Announcements | `GET/POST /courses/{id}/announcements`, `DELETE /announcements/{id}` |
| Discussions | `GET/POST /lessons/{id}/comments` |
| Analytics | `GET /courses/{id}/analytics`, `GET /courses/{id}/analytics/export` |
| Health | `GET /health` |

Full interactive documentation is available at `http://localhost:8000/docs` when the backend is running.

---

*EDUwise — ALU Capstone 2026*
