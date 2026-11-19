/**
 * PARADIGM brand configuration — single source of truth for product naming and logo assets.
 * The logo files are the approved Paradigm crest + wordmark found in prior Paradigm projects
 * (paradigm-feedback "Asset 193.png", also embedded in paradigm-kms). They are used unmodified
 * apart from proportional web resizing. Replace paths here if Marketing issues new variants.
 */
export const BRAND = {
  product: "PARADIGM EVENTOPS",
  productShort: "EVENTOPS",
  subtitle: "Event Operations & Intelligence Platform",
  tagline: "Plan Smarter. Execute Better. Control Everything.",
  organization: "Paradigm LTD",
  logo: {
    /** full crest + wordmark, white — for dark (navy) surfaces only */
    fullWhite: "/branding/paradigm-logo-white-640.png",
    fullWhiteHiRes: "/branding/paradigm-logo-white.png",
    aspect: 2898 / 2405,
    /** crest mark only (cropped from the approved logo), white */
    crestWhite: "/branding/paradigm-crest-white.png",
    crestAspect: 1245 / 1545,
  },
  colors: {
    navy: "#061520",
    navyDeep: "#030C13",
    navyMid: "#0A1F32",
    navyLight: "#0D2438",
    cyan: "#00A8C8",
    cyanLight: "#00C8E8",
    cyanPale: "#A0DEF0",
  },
} as const;
