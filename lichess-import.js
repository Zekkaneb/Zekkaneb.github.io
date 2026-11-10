/* Import from lichess.org via its public study export endpoint:
     GET https://lichess.org/api/study/{studyId}.pgn            (whole study)
     GET https://lichess.org/api/study/{studyId}/{chapterId}.pgn (one chapter)
   Public studies need no login. Private studies need a personal API token with the study:read scope.
   The token is used for that single request only and is never stored. */
(function () {
  const OL = (window.OL = window.OL || {});

  class LichessError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }
  const EXPORT_HELP = 'Fallback: open the study on Lichess, use the share (⋮) menu → "Study PGN" (or "Chapter PGN"), save the file, then drop it into the Upload tab.';

  function parseRef(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    let m = /lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/i.exec(s);
    if (m) return { studyId: m[1], chapterId: m[2] || null };
    m = /^([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?$/.exec(s);
    if (m) return { studyId: m[1], chapterId: m[2] || null };
    return null;
  }

  async function fetchStudy(ref, token, wholeStudy) {
    const base = 'https://lichess.org/api/study/' + ref.studyId + (!wholeStudy && ref.chapterId ? '/' + ref.chapterId : '') + '.pgn';
    const url = base + '?comments=true&variations=true&clocks=false&source=true&orientation=true';
    const headers = { Accept: 'application/x-chess-pgn' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      throw new LichessError('network', 'Could not reach lichess.org (network error or the request was blocked by the browser). ' + EXPORT_HELP);
    }
    if (res.status === 404) throw new LichessError('notfound', 'Lichess says this study was not found. It may be private (add an API token with study:read), or the link may be wrong. ' + EXPORT_HELP);
    if (res.status === 401 || res.status === 403) throw new LichessError('auth', 'Lichess refused access. This study is private or your token lacks the study:read scope. ' + EXPORT_HELP);
    if (res.status === 429) throw new LichessError('ratelimit', 'Lichess is rate limiting requests. Wait a minute and try again, or use the PGN download instead.');
    if (!res.ok) throw new LichessError('http', 'Lichess returned an error (HTTP ' + res.status + '). ' + EXPORT_HELP);
    const text = await res.text();
    if (!text.trim()) throw new LichessError('empty', 'Lichess returned an empty study. ' + EXPORT_HELP);
    return text;
  }

  OL.lichess = { parseRef, fetchStudy, LichessError, EXPORT_HELP };
})();
