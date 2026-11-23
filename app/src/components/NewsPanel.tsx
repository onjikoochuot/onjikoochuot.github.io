import { useEffect, useState } from "react";
import type { MarketEvent, NewsBrief } from "../lib/api";
import type { Setup } from "../engine/types";

export function until(ms: number) {
  const d = ms - Date.now();
  if (d < 0) { const ago = -d / 60000; return ago < 60 ? `${Math.round(ago)} min ago` : `${Math.round(ago / 60)} h ago`; }
  const m = Math.round(d / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return `in ${h} h${mm ? ` ${mm} min` : ""}`;
  const days = Math.round(h / 24);
  return `in ${days} day${days > 1 ? "s" : ""}`;
}
const ago = (t: number) => { const h = (Date.now() - t) / 3600000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 24 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`; };

export function agreement(news: NewsBrief | null, setup: Setup | null): "agrees" | "conflicts" | "neutral" | null {
  if (!news || !setup || setup.verdict === "NO TRADE") return null;
  if (news.opinion.stance === "neutral") return "neutral";
  return (news.opinion.stance === "bullish") === (setup.dir === "long") ? "agrees" : "conflicts";
}

export default function NewsPanel({ news, loading, error, setup }: { news: NewsBrief | null; loading: boolean; error: string; setup: Setup | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(id); }, []);
  const agree = agreement(news, setup);
  const upcoming: MarketEvent[] = (news?.events ?? []).filter((e) => e.at > Date.now() - 2 * 3600000).slice(0, 6);
  return (
    <section className="news card" aria-label="News and upcoming events">
      <div className="news-head">
        <h3>News and what's coming</h3>
        {news && <span className={`tag stance-${news.opinion.stance}`}>{news.opinion.stance === "bullish" ? "Bullish" : news.opinion.stance === "bearish" ? "Bearish" : "Neutral"}</span>}
      </div>
      {loading && !news && <p className="ctx-note">Reading the latest headlines and the economic calendar…</p>}
      {error && !news && <p className="ctx-note">{error}</p>}
      {news && (
        <>
          <p className="op-text">{news.opinion.text}</p>
          <p className="op-meta">
            {agree === "agrees" && <b className="bull">News agrees with the chart. </b>}
            {agree === "conflicts" && <b className="bear">News goes against the chart. </b>}
            {news.opinion.by === "ai" ? "Opinion written by AI from the headlines and calendar below." : "Summary from headline scoring."} It doesn't change the 80% book verdict.
          </p>
          <h4>Coming up</h4>
          {upcoming.length ? (
            <ul className="events-list">{upcoming.map((e) => (
              <li key={e.title + e.at} className={e.impact === "High" ? "hi" : ""}>
                <span className="ev-when mono">{until(e.at)}</span>
                <span className="ev-title">{e.title} <i>{e.currency}</i></span>
                <span className={`ev-imp ${e.impact.toLowerCase()}`}>{e.impact}</span>
                {(e.forecast || e.previous) && <span className="ev-nums mono">{e.forecast ? `fc ${e.forecast}` : ""}{e.previous ? `  prev ${e.previous}` : ""}</span>}
              </li>
            ))}</ul>
          ) : <p className="ctx-note">No medium or high-impact releases for {news.currencies.join(" or ")} in the next week.</p>}
          <h4>Latest headlines <span className={`mood ${news.moodLabel}`}>mood {news.moodLabel}</span></h4>
          <ul className="heads">{news.headlines.slice(0, 8).map((h) => (
            <li key={h.url}>
              <span className={`dot ${h.score > 0 ? "up" : h.score < 0 ? "down" : ""}`} aria-label={h.score > 0 ? "positive" : h.score < 0 ? "negative" : "neutral"} />
              <a href={h.url} target="_blank" rel="noreferrer">{h.title}</a>
              <span className="h-meta">{h.source}, {ago(h.at)}</span>
            </li>
          ))}</ul>
          {!news.headlines.length && <p className="ctx-note">No fresh headlines this week.</p>}
        </>
      )}
    </section>
  );
}
