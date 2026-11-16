import { useEffect, useMemo, useState } from "react";

import {
  ArrowRightOutlined,
  BankOutlined,
  BookOutlined,
  CameraOutlined,
  CarOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  LaptopOutlined,
  LoginOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from "@ant-design/icons";

import api from "../services/api";
import PublicSuggestionForm from "../components/PublicSuggestionForm";
import { resolvePublicGoogleMapsUrl } from "../utils/publicGoogleMapsUrl";
import PublicTenderPage from "./PublicTenderPage";
import "../publicEnhancementsV2.css";

import "../publicCms.css";

import "../publicHomeEnhancements.css";

import "../publicContactCompact.css";

const ICONS = {
  TROPHY: TrophyOutlined,

  READ: ReadOutlined,

  TEAM: TeamOutlined,

  CAR: CarOutlined,

  LAPTOP: LaptopOutlined,

  SAFETY: SafetyCertificateOutlined,

  BANK: BankOutlined,

  BOOK: BookOutlined,

  CHECK: CheckCircleOutlined,
};

const FALLBACK = {
  brand: {
    short_name: "PTS Farooqabad",

    school_name: "Police Training School Farooqabad",

    department: "Punjab Police",

    motto: "DISCIPLINE • TRAINING • SERVICE",

    logo_media_id: null,
  },

  hero: {
    badge: "Punjab Police Training Institution",

    title_line_1: "Police Training",

    title_line_2: "School Farooqabad",

    description:
      "Developing disciplined, professional and service-oriented police personnel through structured training, modern learning, leadership and technology.",

    primary_button: "Explore PTS",

    features: [
      "Professional Training",
      "Digital Management",
      "Institutional Discipline",
    ],
  },

  stats: [
    {
      value: "1975",

      label: "Training Center Established",
    },

    {
      value: "2001",

      label: "Police Training School Status",
    },

    {
      value: "PTS",

      label: "Professional Training",
    },

    {
      value: "24/7",

      label: "Digital System Availability",
    },
  ],

  about: {
    kicker: "OUR INSTITUTION",

    title: "A tradition of professional police training",

    description:
      "Police Training School Farooqabad provides an organized environment for discipline, academic learning, professional development and modern training management.",

    media_id: null,

    history: [
      {
        year: "1975",

        title: "Foundation",

        description:
          "The institution began its journey as a Police Recruit Training Center, supporting structured recruit training.",
      },

      {
        year: "2001",

        title: "Police Training School",

        description:
          "The institution was elevated to Police Training School status, strengthening its role within Punjab Police training.",
      },

      {
        year: "NOW",

        title: "Digital Transformation",

        description:
          "Modern digital systems now support trainee records, biometric attendance, reporting and administration.",
      },
    ],

    values: [
      {
        title: "Discipline",

        description: "Professional habits, responsibility and consistency.",
      },

      {
        title: "Integrity",

        description: "Ethical conduct, accountability and responsible service.",
      },

      {
        title: "Professionalism",

        description: "Knowledge, confidence and professional competence.",
      },

      {
        title: "Service",

        description: "Commitment to disciplined and respectful public service.",
      },
    ],
  },

  principal: {
    kicker: "MESSAGE FROM THE PRINCIPAL",

    title: "Building disciplined professionals for responsible policing.",

    message:
      "Our objective is to develop disciplined, knowledgeable and professionally prepared police personnel through effective training, responsible leadership and continuous learning.",

    name: "Principal",

    designation: "Police Training School Farooqabad",

    photo_media_id: null,
  },

  leadership: {
    kicker: "LEADERSHIP",

    title: "Command & instructional leadership",

    description:
      "Key officers responsible for administration, instruction, discipline and professional training.",

    items: [],
  },

  training: {
    kicker: "TRAINING",

    title: "Professional development for modern policing",

    description:
      "A balanced environment combining discipline, academic learning, professional skills and technology.",

    items: [],
  },

  facilities: {
    kicker: "CAMPUS FACILITIES",

    title: "Supporting institutional and training life",

    description:
      "Core facilities support administration, academics, welfare and professional training activities.",

    main_media_id: null,

    secondary_media_id: null,

    items: [],
  },

  gallery: {
    kicker: "GALLERY",

    title: "Life at PTS Farooqabad",

    description:
      "Campus, training and institutional photographs from Police Training School Farooqabad.",
  },

  contact: {
    kicker: "CONTACT",

    title: "Police Training School Farooqabad",

    description: "Official contact and visitor information.",

    location: "Farooqabad, Punjab, Pakistan",

    location_map_url: "",

    phone: "",

    email: "",

    visitor_hours: "",
  },

  footer: {
    school_name: "Police Training School Farooqabad",

    department: "Punjab Police",

    motto: "DISCIPLINE • TRAINING • SERVICE",
  },
};

/*
|--------------------------------------------------------------------------
| MEDIA URL
|--------------------------------------------------------------------------
*/

function buildMediaUrl(item) {
  if (!item?.url) {
    return null;
  }

  if (/^https?:\/\//i.test(item.url)) {
    return item.url;
  }

  const base = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");

  return `${base}${item.url.startsWith("/") ? item.url : `/${item.url}`}`;
}

/*
|--------------------------------------------------------------------------
| HOME
|--------------------------------------------------------------------------
*/

export default function Home({
  onLogin,
  publicSiteData = null,
  publicSiteLoading = false,
  publicPage = "home",
  onShowTenders,
  onShowHome,
}) {
  const [content, setContent] = useState(FALLBACK);

  const [media, setMedia] = useState([]);

  /*
  |--------------------------------------------------------------------------
  | PUBLIC CONTENT
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let mounted = true;

    const applyData = (data) => {
      if (!mounted || !data) {
        return;
      }

      setContent(data.content || FALLBACK);

      setMedia(Array.isArray(data.media) ? data.media : []);
    };

    if (publicSiteData) {
      applyData(publicSiteData);

      return () => {
        mounted = false;
      };
    }

    if (publicSiteLoading) {
      return () => {
        mounted = false;
      };
    }

    const load = async () => {
      try {
        const response = await api.get("/public-site");

        applyData(response.data?.data);
      } catch (error) {
        console.error(
          "Public website load failed:",
          error.response?.data?.message || error.message,
        );
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [publicSiteData, publicSiteLoading]);

  /*
  |--------------------------------------------------------------------------
  | MEDIA MAP
  |--------------------------------------------------------------------------
  */

  const mediaMap = useMemo(() => {
    const map = new Map();

    media.forEach((item) => {
      map.set(Number(item.id), item);
    });

    return map;
  }, [media]);

  const getMedia = (id) => {
    if (!id) {
      return null;
    }

    return mediaMap.get(Number(id)) || null;
  };

  const logoMedia = getMedia(content.brand?.logo_media_id);

  const heroMedia = getMedia(content.hero?.media_id);

  const aboutMedia = getMedia(content.about?.media_id);

  const principalMedia = getMedia(content.principal?.photo_media_id);

  const facilityMainMedia = getMedia(content.facilities?.main_media_id);

  const facilitySecondaryMedia = getMedia(
    content.facilities?.secondary_media_id,
  );

  const galleryMedia = useMemo(
    () =>
      media
        .filter(
          (item) =>
            item.category === "GALLERY" &&
            item.media_type === "IMAGE" &&
            item.is_active !== false,
        )
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [media],
  );

  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (galleryMedia.length <= 1) {
      return undefined;
    }

    const timer = setInterval(() => {
      setGalleryIndex((current) => (current + 1) % galleryMedia.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [galleryMedia.length]);

  useEffect(() => {
    if (galleryMedia.length > 0 && galleryIndex >= galleryMedia.length) {
      setGalleryIndex(0);
    }
  }, [galleryMedia.length, galleryIndex]);

  const showPreviousGalleryImage = () => {
    if (!galleryMedia.length) {
      return;
    }

    setGalleryIndex((current) =>
      current === 0 ? galleryMedia.length - 1 : current - 1,
    );
  };

  const showNextGalleryImage = () => {
    if (!galleryMedia.length) {
      return;
    }

    setGalleryIndex((current) => (current + 1) % galleryMedia.length);
  };
  /*
  |--------------------------------------------------------------------------
  | SCROLL
  |--------------------------------------------------------------------------
  */

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",

      block: "start",
    });
  };

  /*
  |--------------------------------------------------------------------------
  | LOGIN
  |--------------------------------------------------------------------------
  */

  const handleLogin = () => {
    if (typeof onLogin === "function") {
      onLogin();
    }
  };

  if (publicPage === "tenders") {
    return (
      <PublicTenderPage
        content={content}
        media={media}
        onHome={() => typeof onShowHome === "function" && onShowHome()}
        onLogin={handleLogin}
      />
    );
  }

  const news = (Array.isArray(content.news_updates) ? content.news_updates : [])
    .map((entry) => typeof entry === "string" ? { text: entry, is_active: true } : entry)
    .filter((entry) => entry && entry.is_active !== false && String(entry.text || "").trim());

  return (
    <div className="pts-home improved-public-home">
      {/* ================================================================
          NAVIGATION
      ================================================================= */}

      <header className="public-navbar">
        <div className="public-container public-navbar-inner">
          <button
            type="button"
            className="public-brand"
            onClick={() => scrollToSection("home")}
          >
            <div
              className={`public-brand-logo ${
                logoMedia ? "has-public-logo" : ""
              }`}
            >
              {logoMedia ? (
                <img
                  src={buildMediaUrl(logoMedia)}
                  alt="Police Training School Farooqabad"
                  className="public-site-logo-image"
                />
              ) : (
                "PTS"
              )}
            </div>

            <div className="public-brand-text">
              <strong>{content.brand?.short_name || "PTS Farooqabad"}</strong>

              <span>{content.brand?.department || "Punjab Police"}</span>
            </div>
          </button>

          <nav className="public-nav-links">
            <button type="button" onClick={() => scrollToSection("home")}>
              Home
            </button>

            <button type="button" onClick={() => scrollToSection("about")}>
              About
            </button>

            <button type="button" onClick={() => scrollToSection("training")}>
              Training
            </button>

            <button type="button" onClick={() => scrollToSection("facilities")}>
              Facilities
            </button>

            <button type="button" onClick={() => scrollToSection("gallery")}>
              Gallery
            </button>

            <button type="button" onClick={() => scrollToSection("contact")}>
              Contact
            </button>
            <button type="button" onClick={() => typeof onShowTenders === "function" && onShowTenders()}>
              Tenders
            </button>
          </nav>

          <button type="button" className="pts-public-mobile-tenders"
            onClick={() => typeof onShowTenders === "function" && onShowTenders()}>Tenders</button>

          <button
            type="button"
            className="public-login-btn"
            onClick={handleLogin}
          >
            <LoginOutlined />

            <span>Login</span>
          </button>
        </div>
      </header>

      {/* ================================================================
          HERO
      ================================================================= */}

      <section id="home" className="home-hero improved-home-hero">
        <div className="hero-grid-background" />

        <div className="home-hero-accent home-hero-accent-one" />
        <div className="home-hero-accent home-hero-accent-two" />

        <div className="public-container home-hero-content">
          <div className="hero-left">
            <div className="hero-badge">
              <span className="hero-badge-dot" />

              {content.hero?.badge || "Punjab Police Training Institution"}
            </div>

            <h1>
              {content.hero?.title_line_1 || "Police Training"}

              <span>{content.hero?.title_line_2 || "School Farooqabad"}</span>
            </h1>

            <p>{content.hero?.description}</p>

            <div className="hero-actions">
              <button
                type="button"
                className="hero-primary-btn"
                onClick={() => scrollToSection("about")}
              >
                {content.hero?.primary_button || "Explore PTS"}

                <ArrowRightOutlined />
              </button>

              <button
                type="button"
                className="hero-secondary-btn"
                onClick={handleLogin}
              >
                <LoginOutlined />
                Login
              </button>
            </div>

            <div className="hero-features">
              {(content.hero?.features || []).map((item, index) => (
                <span key={`${item}-${index}`}>
                  <CheckCircleOutlined />

                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="hero-right improved-hero-right">
            <div className="hero-main-card improved-hero-card">
              <div className="hero-card-header">
                <span>{content.brand?.department || "Punjab Police"}</span>

                <span>Farooqabad</span>
              </div>

              <div
                className={`hero-big-logo ${
                  logoMedia ? "has-public-logo" : ""
                }`}
              >
                {logoMedia ? (
                  <img
                    src={buildMediaUrl(logoMedia)}
                    alt="PTS"
                    className="public-site-logo-image"
                  />
                ) : (
                  <>
                    <small>★</small>

                    <strong>PTS</strong>

                    <span>FAROOQABAD</span>
                  </>
                )}
              </div>

              <div className="hero-motto">
                {content.brand?.motto || "DISCIPLINE • TRAINING • SERVICE"}
              </div>

              <div
                className={`fake-campus-picture ${
                  heroMedia ? "has-public-media" : ""
                }`}
              >
                {heroMedia ? (
                  <img
                    src={buildMediaUrl(heroMedia)}
                    alt="Police Training School Farooqabad"
                    className="public-site-dynamic-image"
                  />
                ) : (
                  <>
                    <div className="fake-sun" />

                    <div className="fake-building">
                      <div className="fake-building-roof" />

                      <div className="fake-building-body">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>

                    <div className="fake-campus-label">Campus Photograph</div>
                  </>
                )}
              </div>
            </div>

            <div className="hero-floating-card hero-floating-history">
              <HistoryOutlined />

              <div>
                <strong>{content.stats?.[0]?.value || "1975"}</strong>

                <span>Established</span>
              </div>
            </div>

            <div className="hero-floating-card hero-floating-digital">
              <LaptopOutlined />

              <div>
                <strong>Digital</strong>

                <span>Smart Management</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          STATS
      ================================================================= */}

      <section className="pts-public-news" aria-label="Latest news and notices">
        <div className="public-container pts-public-news-inner">
          <span className="pts-public-news-label">NEWS UPDATES</span>
          <div className="pts-public-news-viewport">
            {news.length ? (
              <div className="pts-public-news-track">
                {[0, 1].map((copy) => (
                  <div className="pts-public-news-group" key={copy} aria-hidden={copy === 1}>
                    {news.map((item, index) => <span className="pts-news-item" key={`${copy}-${index}`}>{item.text}</span>)}
                  </div>
                ))}
              </div>
            ) : <div className="pts-public-news-empty">News and official updates will appear here.</div>}
          </div>
        </div>
      </section>

      {/* ================================================================
          ABOUT
      ================================================================= */}

      <section id="about" className="public-section">
        <div className="public-container">
          <div className="section-heading">
            <span>{content.about?.kicker}</span>

            <h2>{content.about?.title}</h2>

            <p>{content.about?.description}</p>
          </div>

          <div className="about-layout">
            <div
              className={`about-photo-placeholder ${
                aboutMedia ? "has-public-media" : ""
              }`}
            >
              {aboutMedia ? (
                <img
                  src={buildMediaUrl(aboutMedia)}
                  alt="PTS Farooqabad"
                  loading="lazy"
                  className="public-site-dynamic-image"
                />
              ) : (
                <>
                  <CameraOutlined />

                  <strong>{content.brand?.school_name}</strong>

                  <span>Campus photograph</span>
                </>
              )}
            </div>

            <div className="history-content">
              {(content.about?.history || []).map((item, index) => (
                <div key={`${item.year}-${index}`}>
                  <div className="history-item">
                    <div
                      className={`history-year ${
                        String(item.year).toUpperCase() === "NOW"
                          ? "history-year-now"
                          : ""
                      }`}
                    >
                      {item.year}
                    </div>

                    <div>
                      <h3>{item.title}</h3>

                      <p>{item.description}</p>
                    </div>
                  </div>

                  {index < (content.about?.history || []).length - 1 && (
                    <div className="history-connector" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="values-row">
            {(content.about?.values || []).map((item, index) => (
              <article key={`${item.title}-${index}`}>
                <small>{String(index + 1).padStart(2, "0")}</small>

                <h3>{item.title}</h3>

                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          PRINCIPAL
      ================================================================= */}

      <section className="principal-section">
        <div className="public-container">
          <div className="principal-card">
            <div
              className={`principal-photo ${
                principalMedia ? "has-public-media" : ""
              }`}
            >
              {principalMedia ? (
                <img
                  src={buildMediaUrl(principalMedia)}
                  alt={content.principal?.name || "Principal"}
                  loading="lazy"
                  className="public-site-dynamic-image"
                />
              ) : (
                <>
                  <UserOutlined />

                  <span>Principal</span>
                </>
              )}
            </div>

            <div className="principal-message">
              <span className="light-kicker">{content.principal?.kicker}</span>

              <h2>{content.principal?.title}</h2>

              <p>“{content.principal?.message}”</p>

              <div>
                <strong>{content.principal?.name}</strong>

                <span>{content.principal?.designation}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          TRAINING
      ================================================================= */}

      <section id="training" className="public-section">
        <div className="public-container">
          <div className="section-heading">
            <span>{content.training?.kicker}</span>

            <h2>{content.training?.title}</h2>

            <p>{content.training?.description}</p>
          </div>

          <div className="training-grid">
            {(content.training?.items || [])
              .filter((item) => item.is_active !== false)
              .map((item, index) => {
                const Icon = ICONS[item.icon] || TrophyOutlined;

                return (
                  <article
                    className="training-card"
                    key={item.key || item.title}
                  >
                    <div className="training-top">
                      <div className="training-icon">
                        <Icon />
                      </div>

                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </div>

                    <h3>{item.title}</h3>

                    <p>{item.description}</p>

                    <div className="training-line" />
                  </article>
                );
              })}
          </div>
        </div>
      </section>

      {/* ================================================================
          FACILITIES
      ================================================================= */}

      <section id="facilities" className="public-section public-light-section">
        <div className="public-container facilities-layout">
          <div className="facilities-content">
            <span className="section-small-title">
              {content.facilities?.kicker}
            </span>

            <h2>{content.facilities?.title}</h2>

            <p>{content.facilities?.description}</p>

            <div className="facility-list">
              {(content.facilities?.items || [])
                .filter((item) => item.is_active !== false)
                .map((item) => {
                  const Icon = ICONS[item.icon] || BankOutlined;

                  return (
                    <div key={item.key || item.title}>
                      <span>
                        <Icon />
                      </span>

                      <strong>{item.title}</strong>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="facilities-visual">
            <div
              className={`facility-large-picture ${
                facilityMainMedia ? "has-public-media" : ""
              }`}
            >
              {facilityMainMedia ? (
                <img
                  src={buildMediaUrl(facilityMainMedia)}
                  alt="PTS Campus"
                  loading="lazy"
                  className="public-site-dynamic-image"
                />
              ) : (
                <>
                  <BankOutlined />

                  <strong>Main Campus</strong>

                  <span>Photograph</span>
                </>
              )}
            </div>

            <div
              className={`facility-small-picture ${
                facilitySecondaryMedia ? "has-public-media" : ""
              }`}
            >
              {facilitySecondaryMedia ? (
                <img
                  src={buildMediaUrl(facilitySecondaryMedia)}
                  alt="Academic Block"
                  loading="lazy"
                  className="public-site-dynamic-image"
                />
              ) : (
                <>
                  <ReadOutlined />

                  <span>Academic Block</span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          GALLERY
      ================================================================= */}

      <section id="gallery" className="public-section improved-gallery-section">
        <div className="public-container">
          <div className="section-heading">
            <span>{content.gallery?.kicker}</span>

            <h2>{content.gallery?.title}</h2>

            <p>{content.gallery?.description}</p>
          </div>

          <div className="pts-gallery-carousel">
            {galleryMedia.length ? (
              <>
                <div className="pts-gallery-slide">
                  <img
                    src={buildMediaUrl(galleryMedia[galleryIndex])}
                    alt={
                      galleryMedia[galleryIndex]?.title ||
                      `PTS Gallery ${galleryIndex + 1}`
                    }
                    className="public-site-dynamic-image"
                  />

                  <div className="pts-gallery-overlay">
                    <small>PTS FAROOQABAD</small>

                    <strong>
                      {galleryMedia[galleryIndex]?.title || "Campus Life"}
                    </strong>

                    {galleryMedia[galleryIndex]?.caption && (
                      <span>{galleryMedia[galleryIndex].caption}</span>
                    )}
                  </div>

                  {galleryMedia.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="pts-gallery-arrow pts-gallery-arrow-left"
                        onClick={showPreviousGalleryImage}
                        aria-label="Previous gallery image"
                      >
                        ‹
                      </button>

                      <button
                        type="button"
                        className="pts-gallery-arrow pts-gallery-arrow-right"
                        onClick={showNextGalleryImage}
                        aria-label="Next gallery image"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>

                {galleryMedia.length > 1 && (
                  <div className="pts-gallery-dots">
                    {galleryMedia.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={index === galleryIndex ? "active" : ""}
                        onClick={() => setGalleryIndex(index)}
                        aria-label={`Show gallery image ${index + 1}`}
                      />
                    ))}
                  </div>
                )}

                <div className="pts-gallery-counter">
                  {galleryIndex + 1} / {galleryMedia.length}
                </div>
              </>
            ) : (
              <div className="pts-gallery-empty">
                <CameraOutlined />
                <strong>PTS Farooqabad Gallery</strong>
                <span>Gallery photographs will appear here.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================
          CONTACT — compact institutional layout
      ================================================================= */}

      <section id="contact" className="contact-section improved-contact-section pts-contact-compact">
        <div className="public-container pts-contact-shell">
          <div className="pts-contact-upper">
            <div className="pts-contact-identity">
              <div className="pts-contact-brand-line">
                <div className={`contact-logo ${logoMedia ? "has-public-logo" : ""}`}>
                  {logoMedia ? (
                    <img
                      src={buildMediaUrl(logoMedia)}
                      alt="Police Training School Farooqabad Logo"
                      className="public-site-logo-image"
                    />
                  ) : "PTS"}
                </div>
                <span className="light-kicker">{content.contact?.kicker || "CONTACT"}</span>
              </div>

              <h2>{content.contact?.title || "Police Training School Farooqabad"}</h2>
              <p>{content.contact?.description || "Official contact and visitor information."}</p>

              {(() => {
                const mapsUrl = resolvePublicGoogleMapsUrl(content.contact?.location_map_url);
                const locationText = content.contact?.location || "Farooqabad, Punjab, Pakistan";
                return mapsUrl ? (
                  <a
                    className="pts-contact-map-link"
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${locationText} on Google Maps (opens in new tab)`}
                  >
                    <EnvironmentOutlined />
                    <span>{locationText}</span>
                    <ArrowRightOutlined />
                  </a>
                ) : (
                  <div className="pts-contact-map-link pts-contact-map-static">
                    <EnvironmentOutlined />
                    <span>{locationText}</span>
                  </div>
                );
              })()}
            </div>

            <PublicSuggestionForm />
          </div>

          <div className="pts-contact-information" aria-label="Official contact information">
            <div className="pts-contact-information-item">
              <span>Official Phone</span>
              <strong>{content.contact?.phone || "To be updated"}</strong>
            </div>
            <div className="pts-contact-information-item">
              <span>Official Email</span>
              <strong>{content.contact?.email || "To be updated"}</strong>
            </div>
            <div className="pts-contact-information-item">
              <span>Visitor Hours</span>
              <strong>{content.contact?.visitor_hours || "To be updated"}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          FOOTER
      ================================================================= */}

      <footer className="public-footer">
        <div className="public-container public-footer-inner">
          <div>
            <strong>
              {content.footer?.school_name || content.brand?.school_name}
            </strong>

            <span>
              {content.footer?.department || content.brand?.department}
            </span>
          </div>

          <div>{content.footer?.motto || content.brand?.motto}</div>

          <div>
            © {new Date().getFullYear()} {content.footer?.school_name || "Police Training School Farooqabad"}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
