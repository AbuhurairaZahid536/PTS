import { publishBiometricSyncStatus } from "./utils/biometricSyncStatus";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Layout,
  Menu,
  Typography,
  Space,
  Avatar,
  Button,
  message,
  Drawer,
  Grid,
} from "antd";

import {
  DashboardOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileTextOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  IdcardOutlined,
  SafetyCertificateOutlined,
  MenuOutlined,
} from "@ant-design/icons";

import Dashboard from "./pages/Dashboard.jsx";
import Trainees from "./pages/Trainees.jsx";
import Staff from "./pages/Staff.jsx";
import PersonProfile from "./pages/PersonProfile.jsx";
import Courses from "./pages/Courses.jsx";
import Platoons from "./pages/Platoons.jsx";
import Timetable from "./pages/Timetable.jsx";
import WeekendManagement from "./pages/WeekendManagement.jsx";
import ShiftDutyManagement from "./pages/ShiftDutyManagement.jsx";
import Attendance from "./pages/Attendance.jsx";
import Reports from "./pages/Reports.jsx";
import GeneralStatement from "./pages/GeneralStatement.jsx";
import BiometricTransactions from "./pages/BiometricTransactions.jsx";
import DeviceStatus from "./pages/DeviceStatus.jsx";
import UserManagement from "./pages/UserManagement.jsx";
import PublicWebsiteManagement from "./pages/PublicWebsiteManagement.jsx";
import PublicSuggestionsBell from "./components/PublicSuggestionsBell.jsx";
import LeaveManagement from "./pages/LeaveManagement.jsx";
import OsdPermissionManagement from "./pages/OsdPermissionManagement.jsx";
import OutdoorMedicalManagement from "./pages/OutdoorMedicalManagement.jsx";
import ManualAbsenceManagement from "./pages/ManualAbsenceManagement.jsx";
import DutyRestManagement from "./pages/DutyRestManagement.jsx";
import TrainingDropManagement from "./pages/TrainingDropManagement.jsx";
import AuditLogs from "./pages/AuditLogs.jsx";
import Settings from "./pages/Settings.jsx";

import api from "./services/api";
import { useAuth } from "./contexts/AuthContext";

const EMPLOYEE_MASTER_SYNC_SESSION_KEY =
  "pts_employee_master_sync_token_v1";

const { Header, Sider, Content } = Layout;

const { Text } = Typography;

const { useBreakpoint } = Grid;

const DEFAULT_RUNTIME_SETTINGS = {
  idle_logout_minutes: 5,
  biometric_auto_sync_seconds: 10,
  dashboard_refresh_seconds: 60,
  general_statement_refresh_seconds: 60,
};

const PORTAL_HISTORY_KEY = "ptsPortalNavigation";

function buildPortalHistoryUrl({ page, profile = null }) {
  const url = new URL(window.location.href);

  const hash = new URLSearchParams();

  hash.set("portal", String(page || "dashboard"));

  if (profile?.subjectType && profile?.subjectId) {
    hash.set("profile", `${String(profile.subjectType).toUpperCase()}:${Number(profile.subjectId)}`);
  }

  url.hash = hash.toString();

  return `${url.pathname}${url.search}${url.hash}`;
}

function normalizeRuntimeSettings(values) {
  const source = values || {};

  const positiveNumber = (value, fallback) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  };

  return {
    idle_logout_minutes: positiveNumber(
      source.idle_logout_minutes,
      DEFAULT_RUNTIME_SETTINGS.idle_logout_minutes,
    ),

    biometric_auto_sync_seconds: positiveNumber(
      source.biometric_auto_sync_seconds,
      DEFAULT_RUNTIME_SETTINGS.biometric_auto_sync_seconds,
    ),

    dashboard_refresh_seconds: positiveNumber(
      source.dashboard_refresh_seconds,
      DEFAULT_RUNTIME_SETTINGS.dashboard_refresh_seconds,
    ),

    general_statement_refresh_seconds: positiveNumber(
      source.general_statement_refresh_seconds,
      DEFAULT_RUNTIME_SETTINGS.general_statement_refresh_seconds,
    ),
  };
}

export default function App({ brandLogoUrl = "" }) {
  const [collapsed, setCollapsed] = useState(true);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedPage, setSelectedPage] = useState("dashboard");

  const [openKeys, setOpenKeys] = useState([]);

  const [profileTarget, setProfileTarget] = useState(null);

  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  const [runtimeSettings, setRuntimeSettings] = useState(
    DEFAULT_RUNTIME_SETTINGS,
  );

  const [generalStatementCourses, setGeneralStatementCourses] = useState([]);

  const { user, logout, hasPermission } = useAuth();

  const idleTimerRef = useRef(null);

  const syncRunningRef = useRef(false);

  const employeeMasterSyncStartedRef = useRef(false);

  const [employeeMasterSyncReady, setEmployeeMasterSyncReady] = useState(false);

  const logoutHandledRef = useRef(false);

  const loginNavigationInitializedRef = useRef(false);


  const screens = useBreakpoint();

  const isMobile = !screens.md;

  const desktopSiderWidth = 80;

  /*
  |--------------------------------------------------------------------------
  | PORTAL VIEWPORT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;

    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";

    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;

      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | BROWSER TITLE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    document.title =
      "Police Training School Farooqabad - Biometric Attendance Management Information System";
  }, []);

  /*
  |--------------------------------------------------------------------------
  | AUTO-COLLAPSED DESKTOP SIDEBAR
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (user && !isMobile) {
      setCollapsed(true);
    }
  }, [user, isMobile]);

  /*
  |--------------------------------------------------------------------------
  | PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const canViewDashboard =
    hasPermission("dashboard.view") ||
    hasPermission("trainees.view") ||
    hasPermission("staff.view") ||
    hasPermission("attendance.view") ||
    hasPermission("reports.view");

  const canViewUsers =
    hasPermission("users.view") || hasPermission("users.manage");


  const canViewRoles =
    hasPermission("roles.view") || hasPermission("roles.manage");

  const canManagePublicSite = hasPermission("public_site.manage");

  const canViewAudit = hasPermission("audit.view");

  const canViewSettings =
    hasPermission("settings.view") || hasPermission("settings.manage");

  const canViewTrainees =
    hasPermission("trainees.view") || hasPermission("trainees.edit");

  const canViewCourses =
    hasPermission("courses.view") || hasPermission("courses.edit");

  const canViewPlatoons =
    hasPermission("platoons.view") || hasPermission("platoons.edit");

  const canViewStaff =
    hasPermission("staff.view") || hasPermission("staff.edit");

  const canViewTimetable =
    hasPermission("timetable.view") || hasPermission("timetable.edit");

  const canViewWeekend =
    canViewTimetable || hasPermission("weekend.manage");

  const canViewDutyRoster =
    canViewTimetable ||
    hasPermission("duty_roster.view") ||
    hasPermission("duty_roster.manage");

  const canViewDutyRest =
    hasPermission("duty_rest.view") ||
    hasPermission("duty_rest.manage") ||
    hasPermission("staff.view") ||
    hasPermission("staff.edit") ||
    hasPermission("manual_absence.view");

  const canViewAttendance =
    hasPermission("attendance.view") || hasPermission("attendance.correct");

  const canViewGeneralStatement = hasPermission("general_statement.view");

  const canViewBiometric = hasPermission("biometric.view");

  const canViewDevices =
    hasPermission("devices.view") || hasPermission("devices.manage");

  const canViewProfiles =
    hasPermission("profiles.view") || hasPermission("profiles.edit");

  const canViewLeave = hasPermission("leave.view");

  const canViewOsd = hasPermission("osd.view");

  const canViewOutdoor = hasPermission("outdoor.view");

  const canViewManualAbsence = hasPermission("manual_absence.view");

  const canViewTrainingDrop = hasPermission("training_drop.view");

  const canViewReports = hasPermission("reports.view");

  const canViewUserManagement =
    canViewUsers || canViewRoles;

  const canOpenAdministration =
    canViewUserManagement || canManagePublicSite || canViewAudit;

  const defaultLandingPage =
    canViewDashboard
      ? "dashboard"
      : canViewTrainees
        ? "trainees"
        : canViewCourses
          ? "courses"
          : canViewPlatoons
            ? "platoons"
            : canViewStaff
              ? "staff-all"
              : canViewLeave
                ? "trainee-leave"
                : canViewOsd
                  ? "trainee-osd"
                  : canViewOutdoor
                    ? "trainee-outdoor"
                    : canViewManualAbsence
                      ? "manual-absence"
                      : canViewTrainingDrop
                        ? "training-drop"
                        : canViewDutyRest
                          ? "staff-duty-rest"
                          : canViewTimetable
                            ? "timetables"
                            : canViewWeekend
                              ? "weekend-management"
                              : canViewDutyRoster
                                ? "shift-duty"
                                : canViewAttendance
                                  ? "attendance"
                                  : canViewGeneralStatement
                                    ? "general-statement-empty"
                                    : canViewBiometric
                                      ? "biometric-transactions"
                                      : canViewDevices
                                        ? "device-status"
                                        : canViewReports
                                          ? "reports"
                                          : canViewUserManagement
                                            ? "user-management"
                                            : canManagePublicSite
                                              ? "public-website"
                                              : canViewAudit
                                                ? "audit-logs"
                                                : canViewSettings
                                                  ? "settings"
                                                  : "dashboard";

  /*
  |--------------------------------------------------------------------------
  | RUNTIME VALUES
  |--------------------------------------------------------------------------
  */

  const idleLogoutMinutes =
    Number(runtimeSettings.idle_logout_minutes) ||
    DEFAULT_RUNTIME_SETTINGS.idle_logout_minutes;

  const idleLogoutMs = idleLogoutMinutes * 60 * 1000;

  const autoSyncMs =
    (Number(runtimeSettings.biometric_auto_sync_seconds) ||
      DEFAULT_RUNTIME_SETTINGS.biometric_auto_sync_seconds) * 1000;

  const dashboardRefreshMs =
    (Number(runtimeSettings.dashboard_refresh_seconds) ||
      DEFAULT_RUNTIME_SETTINGS.dashboard_refresh_seconds) * 1000;

  const generalStatementRefreshMs =
    (Number(runtimeSettings.general_statement_refresh_seconds) ||
      DEFAULT_RUNTIME_SETTINGS.general_statement_refresh_seconds) * 1000;

  /*
  |--------------------------------------------------------------------------
  | RUNTIME SETTINGS
  |--------------------------------------------------------------------------
  */

  const loadRuntimeSettings = useCallback(async () => {
    if (!user) {
      setRuntimeSettings(DEFAULT_RUNTIME_SETTINGS);

      return;
    }

    try {
      const response = await api.get("/settings/runtime");

      setRuntimeSettings(normalizeRuntimeSettings(response.data?.data));
    } catch (error) {
      console.error(
        "Could not load runtime settings:",
        error.response?.data?.message || error.message,
      );

      setRuntimeSettings(DEFAULT_RUNTIME_SETTINGS);
    }
  }, [user]);

  useEffect(() => {
    loadRuntimeSettings();
  }, [loadRuntimeSettings]);

  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      setRuntimeSettings(normalizeRuntimeSettings(event.detail));
    };

    window.addEventListener(
      "pts-runtime-settings-updated",
      handleSettingsUpdate,
    );

    return () =>
      window.removeEventListener(
        "pts-runtime-settings-updated",
        handleSettingsUpdate,
      );
  }, []);

  /*
  |--------------------------------------------------------------------------
  | BROWSER HISTORY
  |--------------------------------------------------------------------------
  */

  const writeBrowserHistory = useCallback(
    ({ page, profile = null, replace = false }) => {
      const historyState = {
        [PORTAL_HISTORY_KEY]: true,

        selectedPage: page,

        profileTarget: profile,
      };

      const targetUrl = buildPortalHistoryUrl({
        page,
        profile,
      });

      try {
        if (replace) {
          window.history.replaceState(historyState, "", targetUrl);
        } else {
          window.history.pushState(historyState, "", targetUrl);
        }
      } catch (error) {
        console.error("Portal history update failed:", error);
      }
    },
    [],
  );

  /*
  |--------------------------------------------------------------------------
  | LOGIN NAVIGATION
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!user) {
      loginNavigationInitializedRef.current = false;

      return;
    }

    if (loginNavigationInitializedRef.current) {
      return;
    }

    loginNavigationInitializedRef.current = true;

    const currentHistoryState = window.history.state;

    const navigationEntry =
      typeof window.performance?.getEntriesByType === "function"
        ? window.performance.getEntriesByType("navigation")?.[0]
        : null;

    const isBrowserReload =
      navigationEntry?.type === "reload" ||
      window.performance?.navigation?.type === 1;

    /*
    |--------------------------------------------------------------------------
    | MANUAL REFRESH / F5
    |--------------------------------------------------------------------------
    |
    | Browser Back/Forward should restore the actual Portal history, but a
    | manual page refresh starts a fresh Portal view from the user's normal
    | landing page (Dashboard for users who can view it). Replace the current
    | history entry so refresh does not create a duplicate Back step.
    |--------------------------------------------------------------------------
    */

    if (isBrowserReload) {
      setSelectedPage(defaultLandingPage);

      setProfileTarget(null);

      setOpenKeys([]);

      setMobileMenuOpen(false);

      writeBrowserHistory({
        page: defaultLandingPage,

        profile: null,

        replace: true,
      });

      return;
    }

    if (currentHistoryState?.[PORTAL_HISTORY_KEY]) {
      setSelectedPage(
        currentHistoryState.selectedPage || defaultLandingPage,
      );

      setProfileTarget(currentHistoryState.profileTarget || null);

      setOpenKeys([]);

      setMobileMenuOpen(false);

      return;
    }

    setSelectedPage(defaultLandingPage);

    setProfileTarget(null);

    setOpenKeys([]);

    setMobileMenuOpen(false);

    writeBrowserHistory({
      page: defaultLandingPage,

      profile: null,

      replace: true,
    });
  }, [user, writeBrowserHistory, defaultLandingPage]);

  /*
  |--------------------------------------------------------------------------
  | BROWSER BACK / FORWARD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const handlePopState = (event) => {
      const state = event.state;

      if (state?.[PORTAL_HISTORY_KEY]) {
        setSelectedPage(state.selectedPage || "dashboard");

        setProfileTarget(state.profileTarget || null);

        setMobileMenuOpen(false);

        return;
      }

      // A non-portal browser entry must not reset an authenticated user
      // straight to Dashboard. Preserve the current Portal view and
      // normalize the reached history entry instead.
      setMobileMenuOpen(false);

      writeBrowserHistory({
        page: selectedPage || defaultLandingPage,
        profile: profileTarget || null,
        replace: true,
      });
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    defaultLandingPage,
    profileTarget,
    selectedPage,
    writeBrowserHistory,
  ]);

  /*
  |--------------------------------------------------------------------------
  | NAVIGATE PAGE
  |--------------------------------------------------------------------------
  */

  const navigateToPage = useCallback(
    (page) => {
      if (!page) {
        return;
      }

      if (selectedPage === page && !profileTarget) {
        setMobileMenuOpen(false);

        return;
      }

      setSelectedPage(page);

      setProfileTarget(null);

      setMobileMenuOpen(false);

      writeBrowserHistory({
        page,

        profile: null,
      });
    },
    [selectedPage, profileTarget, writeBrowserHistory],
  );

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const openProfile = useCallback(
    ({ subjectType, subjectId, returnPage = null }) => {
      if (!canViewProfiles) {
        message.warning("You do not have permission to view profiles.");

        return;
      }

      if (!subjectType || !subjectId) {
        message.error("Profile record ID is missing.");

        return;
      }

      const id = Number(subjectId);

      if (!Number.isFinite(id) || id <= 0) {
        message.error("Invalid profile record ID.");

        return;
      }

      const target = {
        subjectType: String(subjectType).toUpperCase(),

        subjectId: id,

        returnPage: returnPage || selectedPage,
      };

      setProfileTarget(target);

      setMobileMenuOpen(false);

      writeBrowserHistory({
        page: selectedPage,

        profile: target,
      });
    },
    [selectedPage, writeBrowserHistory, canViewProfiles],
  );

  const closeProfile = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();

      return;
    }

    const returnPage = profileTarget?.returnPage || defaultLandingPage;

    setProfileTarget(null);

    setSelectedPage(returnPage);

    writeBrowserHistory({
      page: returnPage,

      profile: null,

      replace: true,
    });
  }, [profileTarget, writeBrowserHistory, defaultLandingPage]);

  /*
  |--------------------------------------------------------------------------
  | IDLE LOGOUT
  |--------------------------------------------------------------------------
  */

  const resetIdleTimer = useCallback(() => {
    if (!user) {
      return;
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      if (logoutHandledRef.current) {
        return;
      }

      logoutHandledRef.current = true;

      message.warning(
        `Session ended after ${idleLogoutMinutes} minutes of inactivity.`,
      );

      logout();
    }, idleLogoutMs);
  }, [user, logout, idleLogoutMs, idleLogoutMinutes]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    logoutHandledRef.current = false;

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, {
        passive: true,
      });
    });

    resetIdleTimer();

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);

        idleTimerRef.current = null;
      }
    };
  }, [user, resetIdleTimer]);

  /*
  |--------------------------------------------------------------------------
  | EMPLOYEE MASTER SYNC - LOGIN / REFRESH
  |--------------------------------------------------------------------------
  |
  | New login ya browser refresh par ONE TIME full employee reconciliation.
  |
  | ZKBioTime → PTS Staff / Trainees
  |
  | Existing PTS → ZKBioTime writes Staff/Trainee/Course services se
  | immediately hoti rahengi.
  |
  | React StrictMode / repeated effects ki wajah se duplicate request ko
  | employeeMasterSyncStartedRef prevent karta hai. Backend par bhi shared
  | Promise lock hai.
  |--------------------------------------------------------------------------
  */

  const runEmployeeMasterSync = useCallback(async () => {
    if (
      !user ||
      !hasPermission("biometric.sync") ||
      employeeMasterSyncStartedRef.current
    ) {
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | ONCE PER LOGIN TOKEN / BROWSER TAB
    |--------------------------------------------------------------------------
    |
    | Auth token survives a normal browser refresh, while sessionStorage also
    | survives refresh inside the same tab. Running the several-thousand-row
    | employee reconciliation again on every F5 adds heavy ZKBioTime/DB load
    | without adding freshness: the login already completed that reconciliation
    | and normal live transaction sync continues independently.
    |
    | A genuine new login receives a different access token, so it still gets
    | one fresh master reconciliation. New browser tabs have their own
    | sessionStorage and also perform one reconciliation.
    |--------------------------------------------------------------------------
    */

    const currentAccessToken =
      localStorage.getItem("pts_access_token") || "";

    const syncedAccessToken =
      sessionStorage.getItem(EMPLOYEE_MASTER_SYNC_SESSION_KEY) || "";

    if (
      currentAccessToken &&
      syncedAccessToken === currentAccessToken
    ) {
      employeeMasterSyncStartedRef.current = true;
      setEmployeeMasterSyncReady(true);
      return;
    }

    employeeMasterSyncStartedRef.current = true;

    setEmployeeMasterSyncReady(false);

    try {
      const response = await api.post(
        "/biometric/employees/master-sync",
        {},
        {
          timeout: 300000,
        },
      );

      const syncData = response.data?.data || {};
      publishBiometricSyncStatus("employees", {ok:response.data?.success !== false && syncData.complete !== false,
        message:response.data?.message || "Employee reconciliation incomplete"});

      if (currentAccessToken && response.data?.success !== false && syncData.complete !== false) {
        sessionStorage.setItem(
          EMPLOYEE_MASTER_SYNC_SESSION_KEY,
          currentAccessToken,
        );
      }

      window.dispatchEvent(
        new CustomEvent("pts-employee-master-synced", {
          detail: syncData,
        }),
      );

      setDashboardRefreshKey((previous) => previous + 1);

      if (response.data?.success === false) {
        console.warn(
          "ZKBioTime employee master sync completed with warnings:",
          syncData,
        );
      }
    } catch (error) {
      publishBiometricSyncStatus("employees", {ok:false,message:error.response?.data?.error?.message || error.message});
      console.error(
        "ZKBioTime employee master sync failed:",
        error.response?.data?.message || error.message,
      );
    } finally {
      setEmployeeMasterSyncReady(true);
    }
  }, [user, hasPermission]);

  useEffect(() => {
    if (!user) {
      employeeMasterSyncStartedRef.current = false;

      setEmployeeMasterSyncReady(false);

      return;
    }

    if (!hasPermission("biometric.sync")) {
      setEmployeeMasterSyncReady(true);

      return;
    }

    runEmployeeMasterSync();
  }, [user, hasPermission, runEmployeeMasterSync]);

  /*
  |--------------------------------------------------------------------------
  | BIOMETRIC LIVE TRANSACTION SYNC
  |--------------------------------------------------------------------------
  |
  | Sequence:
  |
  | 1. Employee master sync
  | 2. Current-date transaction sync
  | 3. Configured interval transaction sync
  |--------------------------------------------------------------------------
  */

  const runBackgroundSync = useCallback(async () => {
    if (
      !user ||
      !hasPermission("biometric.sync") ||
      !employeeMasterSyncReady ||
      syncRunningRef.current
    ) {
      return;
    }

    syncRunningRef.current = true;

    try {
      const response = await api.post("/biometric/transactions/live-sync");

      const syncData = response.data?.data || {};
      publishBiometricSyncStatus("transactions", {ok:response.data?.success !== false && syncData.complete !== false,
        message:syncData.failed ? `${syncData.failed} transaction(s) awaiting retry` : response.data?.message});

      if (response.data?.success !== false) {
        window.dispatchEvent(
          new CustomEvent("pts-biometric-live-synced", {
            detail: syncData,
          }),
        );
      }
    } catch (error) {
      publishBiometricSyncStatus("transactions", {ok:false,message:error.response?.data?.error?.message || error.message});
      console.error(
        "Background ZKBioTime transaction sync failed:",
        error.response?.data?.message || error.message,
      );
    } finally {
      syncRunningRef.current = false;
    }
  }, [user, hasPermission, employeeMasterSyncReady]);

  useEffect(() => {
    if (!user || !hasPermission("biometric.sync") || !employeeMasterSyncReady) {
      return undefined;
    }

    runBackgroundSync();

    const intervalId = setInterval(runBackgroundSync, autoSyncMs);

    return () => clearInterval(intervalId);
  }, [
    user,
    hasPermission,
    employeeMasterSyncReady,
    runBackgroundSync,
    autoSyncMs,
  ]);

  /*
  |--------------------------------------------------------------------------
  | FIRST LIVE SYNC → DASHBOARD REFRESH
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const handleBiometricLiveSynced = (event) => {
      if (selectedPage !== "dashboard" || profileTarget) {
        return;
      }

      const attendanceRecalculated = Boolean(
        event.detail?.attendance_recalculated,
      );

      if (!attendanceRecalculated) {
        return;
      }

      setDashboardRefreshKey((previous) => previous + 1);
    };

    window.addEventListener(
      "pts-biometric-live-synced",
      handleBiometricLiveSynced,
    );

    return () => {
      window.removeEventListener(
        "pts-biometric-live-synced",
        handleBiometricLiveSynced,
      );
    };
  }, [selectedPage, profileTarget]);

  /*
  |--------------------------------------------------------------------------
  | GENERAL STATEMENT
  |--------------------------------------------------------------------------
  */

  const loadGeneralStatementCourses = useCallback(async () => {
    if (!user || !canViewGeneralStatement) {
      setGeneralStatementCourses([]);

      return [];
    }

    try {
      const response = await api.get("/general-statements/courses");

      const rows = response.data?.data || [];

      const validRows = Array.isArray(rows) ? rows : [];

      setGeneralStatementCourses(validRows);

      return validRows;
    } catch (error) {
      console.error(
        "Could not load General Statement courses:",
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          error.message,
      );

      setGeneralStatementCourses([]);

      return [];
    }
  }, [user, canViewGeneralStatement]);

  useEffect(() => {
    if (!user || !canViewGeneralStatement) {
      setGeneralStatementCourses([]);

      return undefined;
    }

    loadGeneralStatementCourses();

    const intervalId = setInterval(
      loadGeneralStatementCourses,
      generalStatementRefreshMs,
    );

    return () => clearInterval(intervalId);
  }, [
    user,
    canViewGeneralStatement,
    loadGeneralStatementCourses,
    generalStatementRefreshMs,
  ]);

  const generalStatementChildren = generalStatementCourses.length
    ? generalStatementCourses.map((course) => ({
        key: `general-statement-course-${course.id}`,

        label: course.course_name,
      }))
    : [
        {
          key: "general-statement-empty",

          label: "No Active Course",

          disabled: true,
        },
      ];

  /*
  |--------------------------------------------------------------------------
  | ADMINISTRATION CHILDREN
  |--------------------------------------------------------------------------
  */

  const administrationChildren = [
    ...(canViewUserManagement
      ? [
          {
            key: "user-management",

            label: "User Management",
          },
        ]
      : []),

    ...(canManagePublicSite
      ? [
          {
            key: "public-website",

            label: "Public Website",
          },
        ]
      : []),

    ...(canViewAudit
      ? [
          {
            key: "audit-logs",

            label: "Audit Logs",
          },
        ]
      : []),
  ];

  /*
  |--------------------------------------------------------------------------
  | TRAINEE MANAGEMENT CHILDREN
  |--------------------------------------------------------------------------
  */

  const traineeManagementChildren = [
    ...(canViewTrainees
      ? [
          {
            key: "trainees",

            label: "All Trainees",
          },
        ]
      : []),

    ...(canViewCourses
      ? [
          {
            key: "courses",

            label: "Courses",
          },
        ]
      : []),

    ...(canViewPlatoons
      ? [
          {
            key: "platoons",

            label: "Platoons",
          },
        ]
      : []),

    ...(canViewLeave
      ? [
          {
            key: "trainee-leave",

            label: "Leave",
          },
        ]
      : []),

    ...(canViewOsd
      ? [
          {
            key: "trainee-osd",

            label: "OSD / Permission",
          },
        ]
      : []),

    ...(canViewOutdoor
      ? [
          {
            key: "trainee-outdoor",

            label: "Outdoor / Medical",
          },
        ]
      : []),

    ...(canViewManualAbsence
      ? [
          {
            key: "manual-absence",

            label: "Manual Absence",
          },
        ]
      : []),

    ...(canViewTrainingDrop
      ? [
          {
            key: "training-drop",

            label: "Repatriate",
          },
        ]
      : []),
  ];

  /*
  |--------------------------------------------------------------------------
  | STAFF MANAGEMENT CHILDREN
  |--------------------------------------------------------------------------
  */

  const staffManagementChildren = [
    ...(canViewStaff
      ? [
          {
            key: "staff-all",

            label: "All Staff",
          },
        ]
      : []),

    ...(canViewLeave
      ? [
          {
            key: "staff-leave",

            label: "Leave",
          },
        ]
      : []),

    ...(canViewOsd
      ? [
          {
            key: "staff-osd",

            label: "OSD / Permission",
          },
        ]
      : []),

    ...(canViewManualAbsence
      ? [
          {
            key: "staff-manual-absence",

            label: "Absent",
          },
        ]
      : []),

    ...(canViewDutyRest
      ? [
          {
            key: "staff-duty-rest",

            label: "Duty Rest",
          },
        ]
      : []),
  ];

  /*
  |--------------------------------------------------------------------------
  | BIOMETRIC CHILDREN
  |--------------------------------------------------------------------------
  */

  const biometricChildren = [
    ...(canViewBiometric
      ? [
          {
            key: "biometric-transactions",

            label: "Transactions",
          },
        ]
      : []),

    ...(canViewDevices
      ? [
          {
            key: "device-status",

            label: "Device Status",
          },
        ]
      : []),
  ];

  /*
  |--------------------------------------------------------------------------
  | NAVIGATION
  |--------------------------------------------------------------------------
  */

  const navItems = [
    ...(canViewDashboard
      ? [
          {
            key: "dashboard",

            icon: <DashboardOutlined />,

            label: "Dashboard",
          },
        ]
      : []),

    ...(traineeManagementChildren.length
      ? [
          {
            key: "trainee-management",

            icon: <TeamOutlined />,

            label: "Trainee Management",

            children: traineeManagementChildren,
          },
        ]
      : []),

    ...(staffManagementChildren.length
      ? [
          {
            key: "pts-staff",

            icon: <IdcardOutlined />,

            label: "Staff Management",

            children: staffManagementChildren,
          },
        ]
      : []),

    ...((canViewTimetable || canViewWeekend || canViewDutyRoster)
      ? [
          {
            key: "timetable-management",

            icon: <ClockCircleOutlined />,

            label: "Timetable Management",

            children: [
              ...(canViewTimetable
                ? [
                    {
                      key: "timetables",

                      label: "Attendance Timetable",
                    },
                  ]
                : []),

              ...(canViewWeekend
                ? [
                    {
                      key: "weekend-management",

                      label: "Weekend Management",
                    },
                  ]
                : []),

              ...(canViewDutyRoster
                ? [
                    {
                      key: "shift-duty",

                      label: "Shift Duty / Duty Roster",
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),

    ...(canViewAttendance
      ? [
          {
            key: "attendance",

            icon: <CalendarOutlined />,

            label: "Attendance",
          },
        ]
      : []),

    ...(canViewGeneralStatement
      ? [
          {
            key: "general-statements",

            icon: <FileTextOutlined />,

            label: "General Statement",

            children: generalStatementChildren,
          },
        ]
      : []),

    ...(biometricChildren.length
      ? [
          {
            key: "biometric",

            icon: <DatabaseOutlined />,

            label: "Biometric / ZKBioTime",

            children: biometricChildren,
          },
        ]
      : []),

    ...(canViewReports
      ? [
          {
            key: "reports",

            icon: <FileTextOutlined />,

            label: "Reports",
          },
        ]
      : []),

    ...(canOpenAdministration
      ? [
          {
            key: "administration",

            icon: <SafetyCertificateOutlined />,

            label: "Administration",

            children: administrationChildren,
          },
        ]
      : []),

    ...(canViewSettings
      ? [
          {
            key: "settings",

            icon: <SettingOutlined />,

            label: "Settings",
          },
        ]
      : []),
  ];

  /*
  |--------------------------------------------------------------------------
  | SIGN OUT
  |--------------------------------------------------------------------------
  */

  const handleLogout = () => {
    setSelectedPage("dashboard");

    setProfileTarget(null);

    setOpenKeys([]);

    setMobileMenuOpen(false);

    employeeMasterSyncStartedRef.current = false;

    setEmployeeMasterSyncReady(false);

    setGeneralStatementCourses([]);

    setRuntimeSettings(DEFAULT_RUNTIME_SETTINGS);

    writeBrowserHistory({
      page: "dashboard",

      profile: null,

      replace: true,
    });

    logout();
  };

  /*
  |--------------------------------------------------------------------------
  | PAGE RENDERING
  |--------------------------------------------------------------------------
  */

  const renderPage = () => {
    if (profileTarget) {
      return (
        <PersonProfile
          subjectType={profileTarget.subjectType}
          subjectId={profileTarget.subjectId}
          onBack={closeProfile}
        />
      );
    }

    if (selectedPage.startsWith("general-statement-course-")) {
      const courseId = Number(
        selectedPage.replace("general-statement-course-", ""),
      );

      if (Number.isInteger(courseId) && courseId > 0) {
        return (
          <GeneralStatement
            courseId={courseId}
            onOpenProfile={({ subjectType, subjectId }) =>
              openProfile({
                subjectType,
                subjectId,

                returnPage: selectedPage,
              })
            }
          />
        );
      }
    }

    switch (selectedPage) {
      case "dashboard":
        return <Dashboard
          refreshToken={dashboardRefreshKey}
          refreshIntervalMs={dashboardRefreshMs}
        />;

      case "trainees":
        return (
          <Trainees
            onOpenProfile={(record) =>
              openProfile({
                subjectType: "TRAINEE",

                subjectId: record.id,

                returnPage: "trainees",
              })
            }
          />
        );

      case "courses":
        return <Courses />;

      case "platoons":
        return <Platoons />;

      case "trainee-leave":
        return (
          <LeaveManagement subjectType="TRAINEE" defaultCategory="NORMAL" />
        );

      case "trainee-osd":
        return <OsdPermissionManagement subjectType="TRAINEE" />;

      case "trainee-outdoor":
        return <OutdoorMedicalManagement subjectType="TRAINEE" />;

      case "manual-absence":
        return <ManualAbsenceManagement subjectType="TRAINEE" />;

      case "training-drop":
        return <TrainingDropManagement />;

      case "staff-all":
        return (
          <Staff
            defaultCategoryName={null}
            onOpenProfile={(record) =>
              openProfile({
                subjectType: "STAFF",

                subjectId: record.id,

                returnPage: "staff-all",
              })
            }
          />
        );

      case "staff-leave":
        return <LeaveManagement subjectType="STAFF" defaultCategory="NORMAL" />;

      case "staff-osd":
        return <OsdPermissionManagement subjectType="STAFF" />;

      case "staff-manual-absence":
        return <ManualAbsenceManagement subjectType="STAFF" />;

      case "staff-duty-rest":
        return <DutyRestManagement />;

      case "timetables":
        return <Timetable />;

      case "weekend-management":
        return <WeekendManagement />;

      case "shift-duty":
        return <ShiftDutyManagement />;

      case "attendance":
        return (
          <Attendance
            onOpenProfile={({ subjectType, subjectId }) =>
              openProfile({
                subjectType,
                subjectId,

                returnPage: "attendance",
              })
            }
          />
        );

      case "general-statement-empty":
        return (
          <div style={{ padding: 16 }}>
            <Text type="secondary">
              No active General Statement course is available right now.
            </Text>
          </div>
        );

      case "biometric-transactions":
        return <BiometricTransactions />;

      case "device-status":
        return <DeviceStatus />;

      case "reports":
        return (
          <Reports
            onOpenProfile={({ subjectType, subjectId }) =>
              openProfile({
                subjectType,
                subjectId,

                returnPage: "reports",
              })
            }
          />
        );

      case "user-management":
        return <UserManagement />;

      case "public-website":
        return <PublicWebsiteManagement />;

      case "audit-logs":
        return <AuditLogs />;

      case "settings":
        return <Settings />;

      default:
        return canViewDashboard ? (
          <Dashboard
            refreshToken={dashboardRefreshKey}
            refreshIntervalMs={dashboardRefreshMs}
          />
        ) : (
          <div style={{ padding: 16 }}>
            <Text type="secondary">
              You do not have permission to open this page.
            </Text>
          </div>
        );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | MENU CLICK
  |--------------------------------------------------------------------------
  */

  const handleMenuClick = ({ key }) => {
    if (
      [
        "trainee-management",
        "pts-staff",
        "timetable-management",
        "general-statements",
        "general-statement-empty",
        "biometric",
        "administration",
      ].includes(key)
    ) {
      return;
    }

    navigateToPage(key);
  };

  /*
  |--------------------------------------------------------------------------
  | MENU OPEN
  |--------------------------------------------------------------------------
  */

  const handleOpenChange = (keys) => {
    const openingGeneralStatement =
      keys.includes("general-statements") &&
      !openKeys.includes("general-statements");

    if (openingGeneralStatement && canViewGeneralStatement) {
      loadGeneralStatementCourses();
    }

    const latestOpenKey = keys.find((key) => !openKeys.includes(key));

    setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
  };

  const renderBrandIdentity = (compact = false) => (
    <div className={`pts-brand-lockup${compact ? " is-compact" : ""}`}>
      <span className="pts-brand-logo-shell">
        {brandLogoUrl ? (
          <img
            src={brandLogoUrl}
            alt="Police Training School Farooqabad"
            className="pts-brand-logo-image"
          />
        ) : (
          <SafetyCertificateOutlined />
        )}
      </span>

      {!compact && (
        <span className="pts-brand-system-name">
          Biometric Attendance
          <br />
          Management Information System
        </span>
      )}
    </div>
  );

  /*
  |--------------------------------------------------------------------------
  | NAVIGATION MENU
  |--------------------------------------------------------------------------
  */

  const renderNavigationMenu = () => (
    <Menu
      className="pts-portal-menu"
      theme="light"
      mode="inline"
      selectedKeys={[selectedPage]}
      openKeys={openKeys}
      onOpenChange={handleOpenChange}
      onClick={handleMenuClick}
      items={navItems}
      style={{
        borderInlineEnd: 0,

        background: "transparent",
      }}
    />
  );

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <>
      <style>
        {`
          .pts-portal-shell,
          .pts-portal-shell * {
            box-sizing: border-box;
          }

          .pts-portal-scroll {
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }

          .pts-portal-content-inner {
            width: 100%;
            min-width: 0;
            max-width: 100%;
          }

          .pts-portal-content-inner > * {
            min-width: 0;
            max-width: 100%;
          }

          .pts-portal-content-inner .ant-table-wrapper {
            width: 100%;
            max-width: 100%;
          }

          .pts-portal-content-inner .ant-card,
          .pts-portal-content-inner .ant-form,
          .pts-portal-content-inner .ant-row {
            max-width: 100%;
          }

          :root {
            --pts-shell-blue-1: #EAF6FF;
            --pts-shell-blue-2: #D9EEFF;
            --pts-shell-blue-3: #CBE6FB;
            --pts-shell-ink: #071f34;
            --pts-shell-accent: #287DBA;
          }

          .pts-desktop-sider {
            background:
              linear-gradient(
                180deg,
                #EAF6FF 0%,
                #D9EEFF 54%,
                #CFE8FA 100%
              ) !important;

            border-right:
              1px solid
              rgba(
                10,
                41,
                63,
                0.2
              );

            box-shadow:
              8px 0 28px rgba(25,63,93,.12),
              inset -1px 0 0 rgba(255,255,255,.72);

            transition:
              width .24s cubic-bezier(.2,.8,.2,1),
              min-width .24s cubic-bezier(.2,.8,.2,1),
              max-width .24s cubic-bezier(.2,.8,.2,1) !important;
          }

          .pts-portal-menu {
            background:
              transparent !important;

            padding:
              6px 8px;

            color:
              #153a58;
          }

          .pts-portal-menu .ant-menu-item,
          .pts-portal-menu .ant-menu-submenu-title {
            margin-inline:
              0 !important;

            width:
              100% !important;

            border-radius:
              12px;

            color:
              #35536C !important;

            transition:
              background .20s ease,
              color .20s ease,
              transform .20s ease,
              box-shadow .20s ease;
          }

          .pts-portal-menu .ant-menu-item:hover,
          .pts-portal-menu .ant-menu-submenu-title:hover {
            color:
              #1D6599 !important;

            background:
              rgba(
                255,
                255,
                255,
                .66
              ) !important;

            transform:
              translateX(
                2px
              );

            box-shadow:
              0 7px 18px
              rgba(
                55,
                112,
                156,
                .10
              );
          }

          .pts-portal-menu .ant-menu-item-selected {
            color:
              #155B91 !important;

            background:
              linear-gradient(
                135deg,
                rgba(
                  255,
                  255,
                  255,
                  .94
                ),
                rgba(
                  218,
                  239,
                  255,
                  .92
                )
              ) !important;

            box-shadow:
              0 8px 22px rgba(55,112,156,.14),
              inset 0 1px 0 rgba(255,255,255,.9);

            font-weight:
              700;
          }

          .pts-portal-menu .ant-menu-sub {
            background:
              rgba(
                215,
                237,
                253,
                .42
              ) !important;
          }

          .pts-portal-menu .ant-menu-item .anticon,
          .pts-portal-menu .ant-menu-submenu-title .anticon {
            color:
              #4B7899;
          }

          .pts-portal-menu .ant-menu-item-selected .anticon {
            color:
              #1972AE;
          }

          .pts-brand-lockup {
            width: 100%;
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 5px;
            color: #17324A;
            text-align: center;
          }

          .pts-brand-lockup.is-compact {
            gap: 0;
          }

          .pts-brand-logo-shell {
            width: 42px;
            height: 42px;
            flex: 0 0 42px;
            display: grid;
            place-items: center;
            border-radius: 13px;
            overflow: hidden;
            color: #216C9F;
            font-size: 22px;
            background:
              linear-gradient(145deg,rgba(255,255,255,.96),rgba(130,197,248,.82));
            border: 1px solid rgba(53,133,190,.22);
            box-shadow:
              0 8px 20px rgba(54,111,154,.14),
              inset 0 1px 0 rgba(255,255,255,.95);
            transition:
              transform .24s ease,
              box-shadow .24s ease;
          }

          .pts-brand-lockup:hover .pts-brand-logo-shell {
            transform: rotate(-3deg) scale(1.05);
            box-shadow:
              0 11px 26px rgba(30,90,136,.2),
              inset 0 1px 0 rgba(255,255,255,1);
          }

          .pts-brand-logo-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }

          .pts-brand-system-name {
            display: block;
            max-width: 220px;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9px;
            line-height: 1.25;
            font-weight: 700;
            letter-spacing: .08px;
            color: #35536C;
            white-space: normal;
          }

          .pts-header-identity {
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            line-height: 1.08;
          }

          .pts-header-notifications {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            margin-left: auto;
          }

          @media (max-width: 767px) {
            .pts-header-notifications {
              margin-left: 0;
            }
          }

          .pts-header-school {
            color: #17324A;
            font-size: 17px;
            font-weight: 900;
            letter-spacing: .05px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .pts-header-system {
            margin-top: 3px;
            color: #58758B;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: .15px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .pts-portal-header {
            background:
              linear-gradient(
                90deg,
                #DCEFFF 0%,
                #EEF8FF 52%,
                #D9EDFD 100%
              ) !important;

            border-bottom:
              1px solid
              rgba(
                46,
                127,
                184,
                .2
              );

            box-shadow:
              0 8px 28px rgba(23,95,150,.1),
              inset 0 1px 0 rgba(250,232,232,.82) !important;
          }

          .pts-mobile-drawer .ant-drawer-header {
            background:
              linear-gradient(
                135deg,
                #EAF6FF,
                #D7EDFF
              );

            border-bottom:
              1px solid
              rgba(
                22,
                98,
                152,
                .18
              );
          }

          .pts-mobile-drawer .ant-drawer-title,
          .pts-mobile-drawer .ant-drawer-close {
            color:
              #0a2843;
          }

          .pts-mobile-drawer .ant-drawer-body {
            padding:
              0;

            background:
              linear-gradient(
                180deg,
                #EAF6FF 0%,
                #D9EEFF 100%
              );
          }

          .pts-dashboard-subject-tab {
            color:
              #284B66 !important;

            background:
              linear-gradient(
                135deg,
                rgba(255,255,255,.96) 0%,
                rgba(238,247,254,.96) 100%
              ) !important;

            border:
              1px solid
              rgba(
                87,
                139,
                178,
                .36
              ) !important;

            box-shadow:
              0 5px 14px rgba(30,82,120,.07),
              inset 0 1px 0 rgba(255,255,255,.96) !important;

            transition:
              background .20s ease,
              border-color .20s ease,
              color .20s ease,
              box-shadow .20s ease,
              transform .20s ease !important;
          }

          .pts-dashboard-subject-tab:not([style*="linear-gradient"]):hover {
            color:
              #174F78 !important;

            background:
              linear-gradient(
                135deg,
                #E5F3FD 0%,
                #D6EBFA 100%
              ) !important;

            border-color:
              rgba(
                48,
                119,
                169,
                .58
              ) !important;

            box-shadow:
              0 8px 18px rgba(34,96,141,.12),
              inset 0 1px 0 rgba(255,255,255,.95) !important;

            transform:
              translateY(
                -1px
              );
          }

          .pts-dashboard-subject-tab[style*="linear-gradient"] {
            color:
              #FFFFFF !important;

            background:
              linear-gradient(
                135deg,
                #174F78 0%,
                #1E6595 52%,
                #287DBA 100%
              ) !important;

            border-color:
              #174F78 !important;

            box-shadow:
              0 10px 24px rgba(20,74,112,.24),
              inset 0 1px 0 rgba(255,255,255,.22) !important;

            transform:
              translateY(
                -1px
              );
          }

          .pts-dashboard-subject-tab[style*="linear-gradient"] .anticon {
            color:
              #FFFFFF !important;
          }

          .pts-dashboard-subject-tab[style*="linear-gradient"]:hover {
            color:
              #FFFFFF !important;

            background:
              linear-gradient(
                135deg,
                #123F63 0%,
                #195B89 52%,
                #2475AE 100%
              ) !important;

            border-color:
              #123F63 !important;

            box-shadow:
              0 12px 28px rgba(20,74,112,.29),
              inset 0 1px 0 rgba(255,255,255,.24) !important;
          }

          @media (max-width: 767px) {
            .pts-portal-content-inner .ant-space {
              max-width:
                100%;
            }

            .pts-portal-content-inner .ant-table-wrapper {
              overflow-x:
                auto;
            }

            .pts-portal-content-inner .ant-card {
              max-width:
                100%;
            }
          }
        `}
      </style>

      <Layout
        className="pts-portal-shell"
        style={{
          height: "100dvh",

          minHeight: "100vh",

          overflow: "hidden",

          background: "#dbeffe",
        }}
      >
        {!isMobile && (
          <Sider
            className="pts-desktop-sider"
            collapsible
            trigger={null}
            collapsed={collapsed}
            onMouseEnter={() => setCollapsed(false)}
            onMouseLeave={() => setCollapsed(true)}
            width={260}
            collapsedWidth={80}
            style={{
              position: "fixed",

              left: 0,

              top: 0,

              bottom: 0,

              height: "100dvh",

              minHeight: "100vh",

              overflow: "hidden",

              background:
                "linear-gradient(180deg,#EAF6FF 0%,#D9EEFF 54%,#CFE8FA 100%)",

              zIndex: 100,
            }}
          >
            <div
              style={{
                height: "100%",

                minHeight: 0,

                display: "flex",

                flexDirection: "column",
              }}
            >
              <div
                style={{
                  height: 88,

                  flex: "0 0 88px",

                  display: "flex",

                  alignItems: "center",

                  justifyContent: collapsed ? "center" : "flex-start",

                  padding: collapsed ? "0 10px" : "0 14px",

                  overflow: "hidden",
                }}
              >
                {renderBrandIdentity(collapsed)}
              </div>

              <div
                style={{
                  flex: "1 1 auto",

                  minHeight: 0,

                  overflowY: "auto",

                  overflowX: "hidden",

                  paddingBottom: 48,
                }}
              >
                {renderNavigationMenu()}
              </div>
            </div>
          </Sider>
        )}

        <Drawer
          className="pts-mobile-drawer"
          title={renderBrandIdentity(false)}
          placement="left"
          width={300}
          open={isMobile && mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          styles={{
            header: {
              background: "linear-gradient(135deg,#EAF6FF,#D7EDFF)",
            },

            body: {
              padding: 0,

              background: "linear-gradient(180deg,#EAF6FF 0%,#D9EEFF 100%)",
            },
          }}
        >
          {renderNavigationMenu()}
        </Drawer>

        <Layout
          style={{
            height: "100%",

            minWidth: 0,

            overflow: "hidden",

            marginLeft: isMobile ? 0 : desktopSiderWidth,

            transition: "margin-left 0.2s ease",

            background: "#F4F9FD",
          }}
        >
          <Header
            className="pts-portal-header"
            style={{
              height: 64,

              minHeight: 64,

              flex: "0 0 64px",

              padding: isMobile ? "0 12px" : "0 24px",

              background:
                "linear-gradient(90deg,#DCEFFF 0%,#EEF8FF 52%,#D9EDFD 100%)",

              display: "flex",

              alignItems: "center",

              justifyContent: "space-between",

              gap: 12,

              overflow: "hidden",

              zIndex: 90,

              boxShadow: "0 8px 28px rgba(47,105,148,.10)",
            }}
          >
            {isMobile ? (
              <>
                <Button
                  type="text"
                  aria-label="Open navigation menu"
                  icon={
                    <MenuOutlined
                      style={{
                        color: "#28506D",

                        fontSize: 21,
                      }}
                    />
                  }
                  onClick={() => setMobileMenuOpen(true)}
                  style={{
                    width: 42,

                    height: 42,

                    flex: "0 0 42px",
                  }}
                />

                <div
                  style={{
                    minWidth: 0,

                    flex: "1 1 auto",

                    display: "flex",

                    justifyContent: "center",
                  }}
                >
                  <div className="pts-header-identity">
                    <span className="pts-header-school">
                      Police Training School Farooqabad
                    </span>
                    <span className="pts-header-system">
                      Biometric Attendance Management Information System
                    </span>
                  </div>
                </div>

                {canManagePublicSite && (
                  <div
                    className="pts-header-notifications"
                    aria-label="Notifications"
                  >
                    <PublicSuggestionsBell />
                  </div>
                )}

                <Button
                  type="text"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={handleLogout}
                  style={{
                    width: 42,

                    height: 42,

                    padding: 0,

                    flex: "0 0 42px",

                    color: "#28506D",
                  }}
                >
                  <LogoutOutlined />
                </Button>
              </>
            ) : (
              <>
                <div className="pts-header-identity">
                  <span className="pts-header-school">
                    Police Training School Farooqabad
                  </span>
                  <span className="pts-header-system">
                    Biometric Attendance Management Information System
                  </span>
                </div>

                {canManagePublicSite && (
                  <div
                    className="pts-header-notifications"
                    aria-label="Notifications"
                  >
                    <PublicSuggestionsBell />
                  </div>
                )}

                <Button
                  type="text"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={handleLogout}
                  style={{
                    color: "#28506D",

                    flex: "0 0 auto",
                  }}
                >
                  <Space>
                    <Avatar size="small" icon={<UserOutlined />} />

                    <span>{user?.fullName || user?.username || "User"}</span>
                    <LogoutOutlined />
                    <span>Sign out</span>
                  </Space>
                </Button>
              </>
            )}
          </Header>

          <Content
            className="pts-portal-scroll"
            style={{
              flex: "1 1 auto",

              minHeight: 0,

              minWidth: 0,

              overflowY: "auto",

              overflowX: "hidden",

              margin: 0,

              padding: isMobile ? "12px" : "24px",

              background: "#F4F9FD",
            }}
          >
            <div className="pts-portal-content-inner">{renderPage()}</div>
          </Content>
        </Layout>
      </Layout>
    </>
  );
}
