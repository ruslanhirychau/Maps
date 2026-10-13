import { useEffect, useState } from "react";

// Phone-width breakpoint. Keep in sync with the mobile block in styles.css —
// 760px clears tablets (iPad mini portrait is 768px) and only kicks in for
// actual phone widths (including most phones in landscape).
export const MOBILE_QUERY = "(max-width: 760px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
