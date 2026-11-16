import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../services/api";

const AuthContext =
  createContext(null);

const TOKEN_KEY =
  "pts_access_token";

const USER_KEY =
  "pts_user";

/*
|--------------------------------------------------------------------------
| DASHBOARD SESSION PREFERENCES
|--------------------------------------------------------------------------
|
| Hidden dashboard course/category preferences are stored per user.
| They remain available across browser refresh/navigation.
|
| Fresh login and logout clear the current user's saved preferences.
|--------------------------------------------------------------------------
*/

const DASHBOARD_STORAGE_PREFIXES = [
  "pts_dashboard_hidden_v2_",
  "pts_dashboard_hidden_",
  "pts_dashboard_pref_",
];

function getUserStorageId(
  currentUser
) {
  if (!currentUser) {
    return null;
  }

  return String(
    currentUser.id ??
      currentUser.user_id ??
      currentUser.username ??
      currentUser.email ??
      "user"
  );
}

function clearDashboardPreferences(
  currentUser
) {
  try {
    const userId =
      getUserStorageId(
        currentUser
      );

    if (!userId) {
      return;
    }

    const keysToDelete =
      [];

    for (
      let index = 0;
      index < localStorage.length;
      index += 1
    ) {
      const key =
        localStorage.key(
          index
        );

      if (!key) {
        continue;
      }

      const belongsToUser =
        DASHBOARD_STORAGE_PREFIXES.some(
          (
            prefix
          ) =>
            key.startsWith(
              `${prefix}${userId}_`
            )
        );

      if (belongsToUser) {
        keysToDelete.push(
          key
        );
      }
    }

    keysToDelete.forEach(
      (
        key
      ) => {
        localStorage.removeItem(
          key
        );
      }
    );
  } catch (error) {
    console.error(
      "Could not clear Dashboard preferences:",
      error
    );
  }
}

export function AuthProvider({
  children,
}) {
  const [
    token,
    setToken,
  ] = useState(() =>
    localStorage.getItem(
      TOKEN_KEY
    )
  );

  const [
    user,
    setUser,
  ] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem(
          USER_KEY
        ) || "null"
      );
    } catch {
      return null;
    }
  });

  const [
    loading,
    setLoading,
  ] = useState(
    Boolean(token)
  );

  /*
  |--------------------------------------------------------------------------
  | AXIOS AUTH TOKEN
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const interceptor =
      api.interceptors.request.use(
        (config) => {
          const currentToken =
            localStorage.getItem(
              TOKEN_KEY
            );

          if (currentToken) {
            config.headers.Authorization =
              `Bearer ${currentToken}`;
          }

          return config;
        }
      );

    return () => {
      api.interceptors.request.eject(
        interceptor
      );
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | LOAD CURRENT USER
  |--------------------------------------------------------------------------
  |
  | A genuine HTTP 401 clears the local session.
  |
  | Temporary network errors or server-side 5xx errors must not destroy
  | an otherwise valid logged-in session.
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => {
        const currentUser =
          res.data.data.user;

        setUser(
          currentUser
        );

        localStorage.setItem(
          USER_KEY,
          JSON.stringify(
            currentUser
          )
        );
      })
      .catch((error) => {
        const status =
          error?.response?.status;

        /*
        |--------------------------------------------------------------------------
        | GENUINE AUTHENTICATION FAILURE
        |--------------------------------------------------------------------------
        */

        if (status === 401) {
          let storedUser =
            user;

          if (!storedUser) {
            try {
              storedUser =
                JSON.parse(
                  localStorage.getItem(
                    USER_KEY
                  ) || "null"
                );
            } catch {
              storedUser =
                null;
            }
          }

          clearDashboardPreferences(
            storedUser
          );

          localStorage.removeItem(
            TOKEN_KEY
          );

          localStorage.removeItem(
            USER_KEY
          );

          setToken(null);
          setUser(null);

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | TEMPORARY API / NETWORK FAILURE
        |--------------------------------------------------------------------------
        |
        | Keep the existing token/user for:
        | - network timeout
        | - temporary internet failure
        | - backend restart
        | - HTTP 403
        | - HTTP 500 / 502 / 503 / 504
        |--------------------------------------------------------------------------
        */

        console.warn(
          "Could not refresh authenticated user; existing session retained:",
          error?.response?.data?.message ||
            error?.message ||
            "Unknown error"
        );
      })
      .finally(() => {
        setLoading(false);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /*
  |--------------------------------------------------------------------------
  | LOGIN
  |--------------------------------------------------------------------------
  */

  const login =
    async (
      username,
      password
    ) => {
      const res =
        await api.post(
          "/auth/login",
          {
            username,
            password,
          }
        );

      const {
        token:
          accessToken,

        user:
          loggedInUser,
      } = res.data.data;

      clearDashboardPreferences(
        loggedInUser
      );

      localStorage.setItem(
        TOKEN_KEY,
        accessToken
      );

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          loggedInUser
        )
      );

      setToken(
        accessToken
      );

      setUser(
        loggedInUser
      );
    };

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  const logout = () => {
    let currentUser =
      user;

    if (!currentUser) {
      try {
        currentUser =
          JSON.parse(
            localStorage.getItem(
              USER_KEY
            ) || "null"
          );
      } catch {
        currentUser =
          null;
      }
    }

    clearDashboardPreferences(
      currentUser
    );

    localStorage.removeItem(
      TOKEN_KEY
    );

    localStorage.removeItem(
      USER_KEY
    );

    setToken(null);
    setUser(null);
  };

  /*
  |--------------------------------------------------------------------------
  | PERMISSION HELPERS
  |--------------------------------------------------------------------------
  */

  const hasPermission =
    (
      permission
    ) => {
      return Boolean(
        user?.permissions?.includes(
          permission
        )
      );
    };

  const hasAnyPermission =
    (
      permissions = []
    ) => {
      return permissions.some(
        (
          permission
        ) =>
          hasPermission(
            permission
          )
      );
    };

  const hasAllPermissions =
    (
      permissions = []
    ) => {
      return permissions.every(
        (
          permission
        ) =>
          hasPermission(
            permission
          )
      );
    };

  const value =
    useMemo(
      () => ({
        token,
        user,
        loading,

        isAuthenticated:
          Boolean(
            token &&
            user
          ),

        login,
        logout,

        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
      }),
      [
        token,
        user,
        loading,
      ]
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value =
    useContext(
      AuthContext
    );

  if (!value) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return value;
}
