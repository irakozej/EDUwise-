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


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/courses" element={<StudentCourses />} />
        <Route path="/student/courses/:courseId" element={<StudentCourseDetail />} />

        <Route path="/student/quizzes" element={<StudentQuizzes />} />
        <Route path="/student/quizzes/:quizId" element={<StudentTakeQuiz />} />

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





