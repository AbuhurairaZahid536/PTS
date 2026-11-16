import React, { useCallback, useEffect, useRef, useState } from "react";

import ReactDOM from "react-dom/client";

import { ConfigProvider } from "antd";

import App from "./App.jsx";

import Home from "./pages/Home.jsx";

import Login from "./pages/Login.jsx";

import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";

import theme from "./theme.js";
import api from "./services/api.js";

import "./index.css";
import "./public.css";

function buildPublicMediaUrl(item) {
  if (!item?.url) {
    return null;
  }

  if (/^https?:\/\//i.test(item.url)) {
    return item.url;
  }

  const baseURL = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");

  return `${baseURL}${item.url.startsWith("/") ? item.url : `/${item.url}`}`;
}

function setPortalFavicon(url, mimeType = null) {
  if (!url) {
    return;
  }

  let favicon = document.querySelector('link[rel="icon"]');

  if (!favicon) {
    favicon = document.createElement("link");

    favicon.rel = "icon";

    document.head.appendChild(favicon);
  }

  favicon.href = url;

  if (mimeType) {
    favicon.type = mimeType;
  }
}

const PUBLIC_PAGE_KEY = "ptsPublicPage";

function Root() {
  const { loading, isAuthenticated } = useAuth();

  const [publicPage, setPublicPage] = useState(
    new URLSearchParams(window.location.search).get("page") === "tenders" ? "tenders" : "home"
  );

  const [brandLogoUrl, setBrandLogoUrl] = useState(null);

  const [publicSiteData, setPublicSiteData] = useState(null);

  const [publicSiteLoading, setPublicSiteLoading] = useState(true);

  const wasAuthenticatedRef = useRef(false);

  /*
|--------------------------------------------------------------------------
| GLOBAL BRAND LOGO + FAVICON
|--------------------------------------------------------------------------
|
| Home, Login aur authenticated Portal sab same CMS Brand Logo use karenge.
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    let mounted = true;

    const loadBrand = async () => {
      try {
        const response = await api.get("/public-site");

        const data = response.data?.data;

        if (!mounted || !data) {
          return;
        }

        setPublicSiteData(data);

        const content = data.content || {};

        const media = Array.isArray(data.media) ? data.media : [];

        const logoId = Number(content.brand?.logo_media_id);

        if (!logoId) {
          return;
        }

        const logo = media.find((item) => Number(item.id) === logoId);

        const logoUrl = buildPublicMediaUrl(logo);

        if (!logoUrl) {
          return;
        }

        setBrandLogoUrl(logoUrl);

        setPortalFavicon(logoUrl, logo?.mime_type || "image/png");
      } catch (error) {
        console.error(
          "Could not load portal public-site data:",
          error.response?.data?.message || error.message,
        );
      } finally {
        if (mounted) {
          setPublicSiteLoading(false);
        }
      }
    };

    loadBrand();

    return () => {
      mounted = false;
    };
  }, []);
  /*
  |--------------------------------------------------------------------------
  | PUBLIC PREVIEW
  |--------------------------------------------------------------------------
  |
  | Super Admin jab CMS se:
  |
  |   /?public=1
  |
  | open karega to login session active hone ke bawajood
  | PUBLIC HOME PAGE hi show hogi.
  |
  |--------------------------------------------------------------------------
  */

  const searchParams = new URLSearchParams(window.location.search);

  const isPublicPreview = searchParams.get("public") === "1";

  /*
  |--------------------------------------------------------------------------
  | INITIAL PUBLIC PAGE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (loading || isAuthenticated || isPublicPreview) {
      return;
    }

    const state = window.history.state;

    const nextPage = state?.[PUBLIC_PAGE_KEY] === "login" ? "login" :
      (state?.[PUBLIC_PAGE_KEY] === "tenders" || new URLSearchParams(window.location.search).get("page") === "tenders") ? "tenders" : "home";

    setPublicPage(nextPage);
  }, [loading, isAuthenticated, isPublicPreview]);

  /*
  |--------------------------------------------------------------------------
  | BROWSER BACK / FORWARD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const handlePopState = (event) => {
      if (isAuthenticated || isPublicPreview) {
        return;
      }

      const nextPage = event.state?.[PUBLIC_PAGE_KEY] === "login" ? "login" :
        (event.state?.[PUBLIC_PAGE_KEY] === "tenders" || new URLSearchParams(window.location.search).get("page") === "tenders") ? "tenders" : "home";

      setPublicPage(nextPage);

      window.scrollTo(0, 0);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isAuthenticated, isPublicPreview]);

  /*
  |--------------------------------------------------------------------------
  | LOGIN / LOGOUT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (isPublicPreview) {
      return;
    }

    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;

      return;
    }

    if (!loading && wasAuthenticatedRef.current) {
      wasAuthenticatedRef.current = false;

      setPublicPage("home");

      window.history.replaceState(
        {
          [PUBLIC_PAGE_KEY]: "home",
        },
        "",
        window.location.pathname,
      );

      window.scrollTo(0, 0);
    }
  }, [isAuthenticated, loading, isPublicPreview]);

  /*
  |--------------------------------------------------------------------------
  | OPEN LOGIN
  |--------------------------------------------------------------------------
  */

  const openLogin = useCallback(() => {
    setPublicPage("login");

    window.history.pushState(
      {
        [PUBLIC_PAGE_KEY]: "login",
      },
      "",
      window.location.pathname,
    );

    window.scrollTo(0, 0);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | OPEN HOME
  |--------------------------------------------------------------------------
  */

  const openHome = useCallback(() => {
    setPublicPage("home");

    window.history.replaceState(
      {
        [PUBLIC_PAGE_KEY]: "home",
      },
      "",
      window.location.pathname,
    );

    window.scrollTo(0, 0);
  }, []);

  const openTenders = useCallback(() => {
    setPublicPage("tenders");
    const url = new URL(window.location.href);
    url.searchParams.set("page", "tenders");
    window.history.pushState({ [PUBLIC_PAGE_KEY]: "tenders" }, "", `${url.pathname}${url.search}`);
    window.scrollTo(0, 0);
  }, []);

  const returnToPublicHome = useCallback(() => {
    setPublicPage("home");
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    window.history.pushState({ [PUBLIC_PAGE_KEY]: "home" }, "", `${url.pathname}${url.search}`);
    window.scrollTo(0, 0);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <div className="root-loading-page">
        <div className="root-loading-logo">PTS</div>

        <div className="root-loading-spinner" />

        <span>Loading PTS Farooqabad...</span>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PUBLIC PREVIEW MODE
  |--------------------------------------------------------------------------
  */

  if (isPublicPreview) {
    return (
      <Home
        publicSiteData={publicSiteData}
        publicSiteLoading={publicSiteLoading}
        publicPage={publicPage}
        onShowTenders={openTenders}
        onShowHome={returnToPublicHome}
        onLogin={() => {
          /*
           * Preview tab mein Login click:
           *
           * Agar user already authenticated hai
           * to normal URL App.jsx open karega.
           *
           * Agar authenticated nahi hai
           * to normal public homepage open hogi.
           */
          window.location.href = window.location.pathname;
        }}
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | AUTHENTICATED PORTAL
  |--------------------------------------------------------------------------
  */

  if (isAuthenticated) {
    return <App brandLogoUrl={brandLogoUrl || ""} />;
  }

  /*
  |--------------------------------------------------------------------------
  | LOGIN
  |--------------------------------------------------------------------------
  */

  if (publicPage === "login") {
    return <Login onBackHome={openHome} brandLogoUrl={brandLogoUrl} />;
  }

  /*
  |--------------------------------------------------------------------------
  | PUBLIC HOME
  |--------------------------------------------------------------------------
  */

  return (
    <Home
      onLogin={openLogin}
      publicSiteData={publicSiteData}
      publicSiteLoading={publicSiteLoading}
      publicPage={publicPage}
      onShowTenders={openTenders}
      onShowHome={returnToPublicHome}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
