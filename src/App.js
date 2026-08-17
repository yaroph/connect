import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import MainPage from "./routes/MainPage";
import AdminPage from "./routes/AdminPage";
import LoginPage from "./routes/LoginPage";
import SignupPage from "./routes/SignupPage";
import DataImportPage from "./routes/DataImportPage";
import {
  authMe,
  getAuthToken,
  setAuthToken,
} from "./data/storage";
import NoticeHost from "./ui/NoticeHost";
import CyberCursor from "./ui/CyberCursor";
import CyberLoader from "./ui/CyberLoader";

function RequireAuth({ children }) {
  const location = useLocation();
  const [state, setState] = useState({
    loading: true,
    ok: false,
    user: null,
    pending: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const token = getAuthToken();
      if (!token) {
        if (!cancelled)
          setState({ loading: false, ok: false, user: null, pending: 0 });
        return;
      }

      try {
        const me = await authMe();
        if (!cancelled && me && me.ok) {
          setState({
            loading: false,
            ok: true,
            user: me.user,
            pending: me.pending || 0,
          });
          return;
        }
      } catch {
        // token invalid -> clean up
      }

      setAuthToken("");
      if (!cancelled)
        setState({ loading: false, ok: false, user: null, pending: 0 });
    };

    resolveSession();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) return <CyberLoader />;
  if (!state.ok)
    return <Navigate to="/login" replace state={{ from: location }} />;
  return React.cloneElement(children, {
    authUser: state.user,
    authPending: state.pending,
  });
}

function RequireAdmin({ children }) {
  const location = useLocation();
  const [state, setState] = useState({
    loading: true,
    ok: false,
    user: null,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const token = getAuthToken();
      if (!token) {
        if (!cancelled)
          setState({ loading: false, ok: false, user: null, isAdmin: false });
        return;
      }

      try {
        const me = await authMe();
        if (!cancelled && me && me.ok) {
          const isAdmin = Boolean(me.user && me.user.is_admin);
          setState({ loading: false, ok: true, user: me.user, isAdmin });
          return;
        }
      } catch {
        // token invalid -> clean up
      }

      setAuthToken("");
      if (!cancelled)
        setState({ loading: false, ok: false, user: null, isAdmin: false });
    };

    resolveSession();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) return <CyberLoader message="ACCÈS SÉCURISÉ PANEL ADMINISTRATEUR…" />;
  if (!state.ok)
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (!state.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <CyberCursor />
      <NoticeHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/data"
          element={
            <RequireAdmin>
              <DataImportPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <MainPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
