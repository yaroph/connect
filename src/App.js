import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import MainPage from "./routes/MainPage";
import AdminPage from "./routes/AdminPage";
import LoginPage from "./routes/LoginPage";
import SignupPage from "./routes/SignupPage";
import DataImportPage from "./routes/DataImportPage";
import { authLogin, authMe, getAuthToken, getSavedCredentials, setAuthToken } from "./data/storage";
import NoticeHost from "./ui/NoticeHost";

function RequireAuth({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, ok: false, user: null, pending: 0 });

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const token = getAuthToken();
      if (!token) {
        // No token -> maybe we can re-login from saved credentials
        const creds = getSavedCredentials();
        if (creds) {
          try {
            const lr = await authLogin(creds);
            if (lr && lr.ok && lr.token) {
              setAuthToken(lr.token);
              const me = await authMe();
              if (!cancelled && me && me.ok) {
                setState({ loading: false, ok: true, user: me.user, pending: me.pending || 0 });
                return;
              }
            }
          } catch {
            // ignore
          }
        }
        if (!cancelled) setState({ loading: false, ok: false, user: null, pending: 0 });
        return;
      }

      try {
        const me = await authMe();
        if (!cancelled && me && me.ok) {
          setState({ loading: false, ok: true, user: me.user, pending: me.pending || 0 });
          return;
        }
      } catch {
        // token might be invalid (ex: server re-issued tokens). Try auto-login.
      }

      const creds = getSavedCredentials();
      if (creds) {
        try {
          const lr = await authLogin(creds);
          if (lr && lr.ok && lr.token) {
            setAuthToken(lr.token);
            const me2 = await authMe();
            if (!cancelled && me2 && me2.ok) {
              setState({ loading: false, ok: true, user: me2.user, pending: me2.pending || 0 });
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      // Could not restore
      setAuthToken("");
      if (!cancelled) setState({ loading: false, ok: false, user: null, pending: 0 });
    };

    resolveSession();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) return null;
  if (!state.ok) return <Navigate to="/login" replace state={{ from: location }} />;
  return React.cloneElement(children, { authUser: state.user, authPending: state.pending });
}

function RequireAdmin({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, ok: false, user: null, isAdmin: false });

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const token = getAuthToken();
      try {
        if (token) {
          const me = await authMe();
          if (me && me.ok) {
            const isAdmin = Boolean(me.user && me.user.is_admin);
            if (!cancelled) setState({ loading: false, ok: true, user: me.user, isAdmin });
            return;
          }
        }
      } catch {
        // token invalid -> fall through
      }

      const creds = getSavedCredentials();
      if (creds) {
        try {
          const lr = await authLogin(creds);
          if (lr && lr.ok && lr.token) {
            setAuthToken(lr.token);
            const me2 = await authMe();
            if (me2 && me2.ok) {
              const isAdmin = Boolean(me2.user && me2.user.is_admin);
              if (!cancelled) setState({ loading: false, ok: true, user: me2.user, isAdmin });
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      setAuthToken("");
      if (!cancelled) setState({ loading: false, ok: false, user: null, isAdmin: false });
    };

    resolveSession();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) return null;
  if (!state.ok) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!state.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <NoticeHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/data" element={<DataImportPage />} />
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
