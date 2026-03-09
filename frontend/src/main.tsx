import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentCourses from "./pages/StudentCourses";
import StudentCourseDetail from "./pages/StudentCoursesDetail";
import StudentQuizzes from "./pages/StudentQuizzes";
import StudentTakeQuiz from "./pages/StudentTakeQuiz";
import StudentHistory from "./pages/StudentHistory";
import StudentExercise from "./pages/StudentExercise";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherCourseDetail from "./pages/TeacherCourseDetail";
import TeacherStudentProgress from "./pages/TeacherStudentProgress";
import TeacherAssignmentGrading from "./pages/TeacherAssignmentGrading";
import AdminDashboard from "./pages/AdminDashboard";
import ProfilePage from "./pages/ProfilePage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* Student routes */}
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/courses" element={<StudentCourses />} />
        <Route path="/student/courses/:courseId" element={<StudentCourseDetail />} />
        <Route path="/student/quizzes" element={<StudentQuizzes />} />
        <Route path="/student/quizzes/:quizId" element={<StudentTakeQuiz />} />
        <Route path="/student/history" element={<StudentHistory />} />
        <Route path="/student/lessons/:lessonId/exercises" element={<StudentExercise />} />

        {/* Teacher routes */}
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/courses/:courseId" element={<TeacherCourseDetail />} />
        <Route path="/teacher/courses/:courseId/students/:studentId" element={<TeacherStudentProgress />} />
        <Route path="/teacher/assignments/:assignmentId/grade" element={<TeacherAssignmentGrading />} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Profile */}
        <Route path="/profile" element={<ProfilePage />} />

        {/* Auth helpers */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);





