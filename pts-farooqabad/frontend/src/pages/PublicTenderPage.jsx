import { ArrowLeftOutlined, FileImageOutlined, LoginOutlined } from "@ant-design/icons";
import api from "../services/api";
import "../publicEnhancementsV2.css";

function imageUrl(item) {
  if (!item?.url) return null;
  if (/^https?:\/\//i.test(item.url)) return item.url;
  const base = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");
  return `${base}${item.url.startsWith("/") ? item.url : `/${item.url}`}`;
}

export default function PublicTenderPage({ content = {}, media = [], onHome, onLogin }) {
  const logo = media.find((item) => Number(item.id) === Number(content.brand?.logo_media_id));
  const imageMap = new Map(media.map((item) => [Number(item.id), item]));
  const tenders = (Array.isArray(content.tenders) ? content.tenders : [])
    .filter((item) => item && item.is_active !== false && String(item.title || "").trim());

  return (
    <div className="pts-home improved-public-home">
      <header className="public-navbar">
        <div className="public-container public-navbar-inner">
          <button type="button" className="public-brand" onClick={onHome}>
            <div className={`public-brand-logo ${logo ? "has-public-logo" : ""}`}>
              {logo ? <img className="public-site-logo-image" src={imageUrl(logo)} alt="PTS Logo" /> : "PTS"}
            </div>
            <div className="public-brand-text">
              <strong>{content.brand?.short_name || "PTS Farooqabad"}</strong>
              <span>{content.brand?.department || "Punjab Police"}</span>
            </div>
          </button>
          <nav className="public-nav-links"><button type="button" onClick={onHome}>Home</button><span className="pts-public-active-nav">Tenders</span></nav>
          <span className="pts-public-mobile-tenders pts-public-tenders-current">Tenders</span>
          <button type="button" className="public-login-btn" onClick={onLogin}><LoginOutlined /> Login</button>
        </div>
      </header>
      <main className="pts-public-tender-main public-container">
        <button className="pts-back-home" type="button" onClick={onHome}><ArrowLeftOutlined /> Back to Home</button>
        <div className="pts-public-page-heading">
          <span>PUBLIC PROCUREMENT NOTICES</span>
          <h1>Tenders & Notices</h1>
          <p>Official tender advertisements and their descriptions published by Police Training School Farooqabad.</p>
        </div>
        {tenders.length ? (
          <div className="pts-tenders-grid">
            {tenders.map((item, index) => {
              const notice = imageMap.get(Number(item.image_media_id));
              const src = notice?.media_type === "IMAGE" ? imageUrl(notice) : null;
              return (
                <article className="pts-tender-card" key={item.id || index}>
                  {src ? <a href={src} target="_blank" rel="noopener noreferrer" title="Open full advertisement"><img src={src} alt={`Tender advertisement: ${item.title}`} loading="lazy" /></a>
                    : <div className="pts-tender-placeholder"><FileImageOutlined /><span>Advertisement image pending</span></div>}
                  <div className="pts-tender-content">
                    {item.date && <time>{item.date}</time>}
                    <h2>{item.title}</h2>
                    <p className="pts-tender-description">{item.description || "Further details will be published by the institution."}</p>
                    {src && <a className="pts-open-ad" href={src} target="_blank" rel="noopener noreferrer">View full advertisement →</a>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="pts-tenders-empty"><FileImageOutlined /><h2>No active tenders</h2><p>Official tender notices will appear here when published.</p></div>}
      </main>
      <footer className="public-footer"><div className="public-container public-footer-inner"><span>Police Training School Farooqabad · Punjab Police</span><span>Official Public Website</span></div></footer>
    </div>
  );
}
